"""Tests for data quality and validation systems."""

import pytest
from datetime import datetime, timezone

from regulatory_kb.processing.quality import (
    DocumentQuarantine,
    QuarantinedDocument,
    QuarantineReason,
    QualityScorer,
    QualityScore,
    GraphIntegrityChecker,
    IntegrityIssue,
    DataConsistencyValidator,
    ManualReviewQueue,
)


class TestDocumentQuarantine:
    """Tests for DocumentQuarantine class."""

    @pytest.fixture
    def quarantine(self):
        return DocumentQuarantine(max_quarantine_size=10)

    def test_quarantine_document(self, quarantine):
        """Test quarantining a document."""
        doc = quarantine.quarantine(
            document_id="doc_001",
            reason=QuarantineReason.PARSING_FAILED,
            message="Failed to parse PDF",
        )

        assert doc.document_id == "doc_001"
        assert doc.reason == QuarantineReason.PARSING_FAILED
        assert doc.message == "Failed to parse PDF"
        assert not doc.resolved

    def test_is_quarantined(self, quarantine):
        """Test checking if document is quarantined."""
        quarantine.quarantine(
            document_id="doc_001",
            reason=QuarantineReason.VALIDATION_FAILED,
            message="Validation failed",
        )

        assert quarantine.is_quarantined("doc_001") is True
        assert quarantine.is_quarantined("doc_002") is False

    def test_release_document(self, quarantine):
        """Test releasing a document from quarantine."""
        quarantine.quarantine(
            document_id="doc_001",
            reason=QuarantineReason.LOW_QUALITY_SCORE,
            message="Quality score too low",
        )

        result = quarantine.release("doc_001", "Manually reviewed and approved")

        assert result is True
        assert quarantine.is_quarantined("doc_001") is False

        doc = quarantine.get("doc_001")
        assert doc.resolved is True
        assert doc.resolution_notes == "Manually reviewed and approved"

    def test_increment_retry(self, quarantine):
        """Test incrementing retry count."""
        quarantine.quarantine(
            document_id="doc_001",
            reason=QuarantineReason.PARSING_FAILED,
            message="Parse error",
        )

        quarantine.increment_retry("doc_001")
        doc = quarantine.get("doc_001")
        assert doc.retry_count == 1

    def test_can_retry(self, quarantine):
        """Test can_retry logic."""
        doc = quarantine.quarantine(
            document_id="doc_001",
            reason=QuarantineReason.PARSING_FAILED,
            message="Parse error",
        )

        assert doc.can_retry() is True

        # Exhaust retries
        for _ in range(3):
            quarantine.increment_retry("doc_001")

        assert doc.can_retry() is False

    def test_get_pending_retries(self, quarantine):
        """Test getting documents that can be retried."""
        quarantine.quarantine("doc_001", QuarantineReason.PARSING_FAILED, "Error 1")
        quarantine.quarantine("doc_002", QuarantineReason.PARSING_FAILED, "Error 2")

        # Exhaust retries for doc_001
        for _ in range(3):
            quarantine.increment_retry("doc_001")

        pending = quarantine.get_pending_retries()
        assert len(pending) == 1
        assert pending[0].document_id == "doc_002"

    def test_get_by_reason(self, quarantine):
        """Test filtering by quarantine reason."""
        quarantine.quarantine("doc_001", QuarantineReason.PARSING_FAILED, "Error 1")
        quarantine.quarantine("doc_002", QuarantineReason.VALIDATION_FAILED, "Error 2")
        quarantine.quarantine("doc_003", QuarantineReason.PARSING_FAILED, "Error 3")

        parsing_failed = quarantine.get_by_reason(QuarantineReason.PARSING_FAILED)
        assert len(parsing_failed) == 2

    def test_statistics(self, quarantine):
        """Test quarantine statistics."""
        quarantine.quarantine("doc_001", QuarantineReason.PARSING_FAILED, "Error 1")
        quarantine.quarantine("doc_002", QuarantineReason.VALIDATION_FAILED, "Error 2")
        quarantine.release("doc_001", "Fixed")

        stats = quarantine.get_statistics()
        assert stats["total"] == 2
        assert stats["active"] == 1
        assert stats["resolved"] == 1

    def test_max_size_eviction(self, quarantine):
        """Test eviction when max size is reached."""
        # Fill quarantine
        for i in range(12):
            quarantine.quarantine(f"doc_{i:03d}", QuarantineReason.PARSING_FAILED, f"Error {i}")

        # Should have evicted oldest
        assert len(quarantine._quarantine) <= 10


class TestQualityScorer:
    """Tests for QualityScorer class."""

    @pytest.fixture
    def scorer(self):
        return QualityScorer()

    def test_calculate_score_perfect(self, scorer):
        """Test calculating perfect quality score."""
        score = scorer.calculate_score(
            document_id="doc_001",
            completeness_factors={"has_title": True, "has_content": True, "has_metadata": True},
            accuracy_factors={"format_correct": 1.0, "data_valid": 1.0},
            consistency_factors={"consistent_dates": True, "consistent_ids": True},
        )

        assert score.overall_score == 1.0
        assert score.completeness_score == 1.0
        assert score.accuracy_score == 1.0
        assert score.consistency_score == 1.0
        assert len(score.flags) == 0

    def test_calculate_score_low_quality(self, scorer):
        """Test calculating low quality score."""
        score = scorer.calculate_score(
            document_id="doc_001",
            completeness_factors={"has_title": True, "has_content": False, "has_metadata": False},
            accuracy_factors={"format_correct": 0.3, "data_valid": 0.2},
            consistency_factors={"consistent_dates": False, "consistent_ids": False},
        )

        assert score.overall_score < 0.6
        assert "low_overall_quality" in score.flags
        assert score.requires_review is True

    def test_calculate_score_incomplete(self, scorer):
        """Test score with incomplete content."""
        score = scorer.calculate_score(
            document_id="doc_001",
            completeness_factors={"has_title": True, "has_content": False, "has_metadata": False, "has_sections": False},
            accuracy_factors={"format_correct": 1.0},
            consistency_factors={"consistent": True},
        )

        assert score.completeness_score == 0.25
        assert "incomplete_content" in score.flags

    def test_get_documents_requiring_review(self, scorer):
        """Test getting documents requiring review."""
        scorer.calculate_score(
            "doc_001",
            {"complete": True},
            {"accurate": 1.0},
            {"consistent": True},
        )
        scorer.calculate_score(
            "doc_002",
            {"complete": False},
            {"accurate": 0.2},
            {"consistent": False},
        )

        requiring_review = scorer.get_documents_requiring_review()
        assert len(requiring_review) == 1
        assert requiring_review[0].document_id == "doc_002"

    def test_get_low_quality_documents(self, scorer):
        """Test getting low quality documents."""
        scorer.calculate_score("doc_001", {"a": True}, {"b": 1.0}, {"c": True})
        scorer.calculate_score("doc_002", {"a": False}, {"b": 0.1}, {"c": False})

        low_quality = scorer.get_low_quality_documents(threshold=0.5)
        assert len(low_quality) == 1


class TestGraphIntegrityChecker:
    """Tests for GraphIntegrityChecker class."""

    @pytest.fixture
    def checker(self):
        return GraphIntegrityChecker()

    def test_register_node(self, checker):
        """Test registering nodes."""
        checker.register_node("Document", "doc_001")
        checker.register_node("Regulator", "reg_001")

        assert "doc_001" in checker._known_nodes["Document"]
        assert "reg_001" in checker._known_nodes["Regulator"]

    def test_check_integrity_valid(self, checker):
        """Test integrity check with valid relationships."""
        checker.register_node("Document", "doc_001")
        checker.register_node("Regulator", "reg_001")
        checker.register_relationship("Document", "doc_001", "Regulator", "reg_001")

        issues = checker.check_integrity()
        # Should have no orphaned reference issues
        orphaned_issues = [i for i in issues if "orphaned" in i.issue_type]
        assert len(orphaned_issues) == 0

    def test_check_integrity_orphaned_target(self, checker):
        """Test detection of orphaned target references."""
        checker.register_node("Document", "doc_001")
        # Don't register reg_001
        checker.register_relationship("Document", "doc_001", "Regulator", "reg_001")

        issues = checker.check_integrity()
        orphaned = [i for i in issues if i.issue_type == "orphaned_target"]
        assert len(orphaned) == 1
        assert orphaned[0].target_id == "reg_001"

    def test_check_integrity_orphaned_source(self, checker):
        """Test detection of orphaned source references."""
        checker.register_node("Regulator", "reg_001")
        # Don't register doc_001
        checker.register_relationship("Document", "doc_001", "Regulator", "reg_001")

        issues = checker.check_integrity()
        orphaned = [i for i in issues if i.issue_type == "orphaned_source"]
        assert len(orphaned) == 1
        assert orphaned[0].source_id == "doc_001"

    def test_check_missing_required_relationships(self, checker):
        """Test detection of missing required relationships."""
        checker.register_node("Document", "doc_001")
        checker.register_node("Document", "doc_002")
        checker.register_node("Regulator", "reg_001")

        # Only doc_001 has ISSUED_BY relationship
        checker.register_relationship("Document", "doc_001", "Regulator", "reg_001")

        issues = checker.check_integrity()
        missing = [i for i in issues if i.issue_type == "missing_relationship"]
        assert len(missing) == 1
        assert missing[0].source_id == "doc_002"

    def test_find_orphaned_documents(self, checker):
        """Test finding orphaned documents."""
        checker.register_node("Document", "doc_001")
        checker.register_node("Document", "doc_002")
        checker.register_node("Document", "doc_003")

        # doc_001 references doc_002
        checker.register_relationship("Document", "doc_001", "Document", "doc_002")

        orphaned = checker.find_orphaned_documents()
        assert "doc_003" in orphaned
        assert "doc_001" not in orphaned
        assert "doc_002" not in orphaned

    def test_get_issues_by_severity(self, checker):
        """Test filtering issues by severity."""
        checker.register_node("Document", "doc_001")
        checker.register_relationship("Document", "doc_001", "Regulator", "reg_001")

        issues = checker.check_integrity()
        errors = checker.get_issues_by_severity("error")
        warnings = checker.get_issues_by_severity("warning")

        # Should have error for orphaned target
        assert len(errors) >= 1


class TestDataConsistencyValidator:
    """Tests for DataConsistencyValidator class."""

    @pytest.fixture
    def validator(self):
        return DataConsistencyValidator()

    def test_register_documents(self, validator):
        """Test registering documents in different stores."""
        validator.register_s3_document("doc_001")
        validator.register_graph_document("doc_001")
        validator.register_vector_document("doc_001")

        assert "doc_001" in validator._s3_documents
        assert "doc_001" in validator._graph_documents
        assert "doc_001" in validator._vector_documents

    def test_check_consistency_all_consistent(self, validator):
        """Test consistency check when all stores are consistent."""
        validator.register_s3_document("doc_001")
        validator.register_graph_document("doc_001")
        validator.register_vector_document("doc_001")

        issues = validator.check_consistency()
        assert len(issues) == 0

    def test_check_consistency_missing_in_graph(self, validator):
        """Test detection of documents missing in graph."""
        validator.register_s3_document("doc_001")
        # Don't register in graph

        issues = validator.check_consistency()
        missing_graph = [i for i in issues if i["type"] == "missing_in_graph"]
        assert len(missing_graph) == 1

    def test_check_consistency_missing_in_s3(self, validator):
        """Test detection of documents missing in S3."""
        validator.register_graph_document("doc_001")
        # Don't register in S3

        issues = validator.check_consistency()
        missing_s3 = [i for i in issues if i["type"] == "missing_in_s3"]
        assert len(missing_s3) == 1

    def test_check_consistency_missing_in_vector(self, validator):
        """Test detection of documents missing in vector store."""
        validator.register_s3_document("doc_001")
        validator.register_graph_document("doc_001")
        # Don't register in vector

        issues = validator.check_consistency()
        missing_vector = [i for i in issues if i["type"] == "missing_in_vector"]
        assert len(missing_vector) == 1

    def test_get_consistent_documents(self, validator):
        """Test getting fully consistent documents."""
        # doc_001 is in all stores
        validator.register_s3_document("doc_001")
        validator.register_graph_document("doc_001")
        validator.register_vector_document("doc_001")

        # doc_002 is only in S3 and graph
        validator.register_s3_document("doc_002")
        validator.register_graph_document("doc_002")

        consistent = validator.get_consistent_documents()
        assert "doc_001" in consistent
        assert "doc_002" not in consistent

    def test_statistics(self, validator):
        """Test consistency statistics."""
        validator.register_s3_document("doc_001")
        validator.register_graph_document("doc_001")
        validator.register_vector_document("doc_001")
        validator.register_s3_document("doc_002")

        stats = validator.get_statistics()
        assert stats["s3_documents"] == 2
        assert stats["graph_documents"] == 1
        assert stats["fully_consistent"] == 1


class TestManualReviewQueue:
    """Tests for ManualReviewQueue class."""

    @pytest.fixture
    def queue(self):
        return ManualReviewQueue()

    def test_add_to_queue(self, queue):
        """Test adding document to review queue."""
        item = queue.add(
            document_id="doc_001",
            reason="Low quality score",
            priority=2,
        )

        assert item.document_id == "doc_001"
        assert item.reason == "Low quality score"
        assert item.priority == 2
        assert item.status == "pending"

    def test_assign_reviewer(self, queue):
        """Test assigning a reviewer."""
        queue.add("doc_001", "Review needed", priority=1)

        result = queue.assign("doc_001", "reviewer@example.com")

        assert result is True
        item = queue.get("doc_001")
        assert item.assigned_to == "reviewer@example.com"
        assert item.status == "in_review"

    def test_approve_document(self, queue):
        """Test approving a document."""
        queue.add("doc_001", "Review needed")
        queue.assign("doc_001", "reviewer")

        result = queue.approve("doc_001", "Looks good")

        assert result is True
        item = queue.get("doc_001")
        assert item.status == "approved"
        assert "Approved: Looks good" in item.notes

    def test_reject_document(self, queue):
        """Test rejecting a document."""
        queue.add("doc_001", "Review needed")

        result = queue.reject("doc_001", "Missing required sections")

        assert result is True
        item = queue.get("doc_001")
        assert item.status == "rejected"
        assert "Rejected: Missing required sections" in item.notes

    def test_get_pending_sorted_by_priority(self, queue):
        """Test getting pending items sorted by priority."""
        queue.add("doc_001", "Reason 1", priority=3)
        queue.add("doc_002", "Reason 2", priority=1)
        queue.add("doc_003", "Reason 3", priority=2)

        pending = queue.get_pending()

        assert len(pending) == 3
        assert pending[0].document_id == "doc_002"  # Priority 1
        assert pending[1].document_id == "doc_003"  # Priority 2
        assert pending[2].document_id == "doc_001"  # Priority 3

    def test_statistics(self, queue):
        """Test queue statistics."""
        queue.add("doc_001", "Reason 1")
        queue.add("doc_002", "Reason 2")
        queue.approve("doc_001", "OK")

        stats = queue.get_statistics()
        assert stats["total"] == 2
        assert stats["by_status"]["pending"] == 1
        assert stats["by_status"]["approved"] == 1

    def test_priority_clamping(self, queue):
        """Test that priority is clamped to valid range."""
        item1 = queue.add("doc_001", "Reason", priority=0)
        item2 = queue.add("doc_002", "Reason", priority=10)

        assert item1.priority == 1  # Clamped to minimum
        assert item2.priority == 5  # Clamped to maximum
