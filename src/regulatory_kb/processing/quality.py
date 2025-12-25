"""Data quality and validation systems for regulatory documents.

Implements Requirements 12.6, 12.7:
- Document quarantine for failed processing
- Quality scoring and manual review flagging
- Referential integrity checks for graph relationships
- Data consistency validation across storage layers
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import structlog

from regulatory_kb.core.errors import ValidationError

logger = structlog.get_logger(__name__)


class QuarantineReason(str, Enum):
    """Reasons for quarantining a document."""

    PARSING_FAILED = "parsing_failed"
    VALIDATION_FAILED = "validation_failed"
    METADATA_INCOMPLETE = "metadata_incomplete"
    LOW_QUALITY_SCORE = "low_quality_score"
    INTEGRITY_VIOLATION = "integrity_violation"
    DUPLICATE_DETECTED = "duplicate_detected"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"


class DocumentStatus(str, Enum):
    """Processing status of a document."""

    PENDING = "pending"
    PROCESSING = "processing"
    PROCESSED = "processed"
    QUARANTINED = "quarantined"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class QuarantinedDocument:
    """Represents a document in quarantine."""

    document_id: str
    reason: QuarantineReason
    message: str
    quarantined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    original_content: Optional[bytes] = None
    metadata: dict = field(default_factory=dict)
    retry_count: int = 0
    max_retries: int = 3
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "document_id": self.document_id,
            "reason": self.reason.value,
            "message": self.message,
            "quarantined_at": self.quarantined_at.isoformat(),
            "metadata": self.metadata,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolution_notes": self.resolution_notes,
        }

    def can_retry(self) -> bool:
        """Check if document can be retried."""
        return not self.resolved and self.retry_count < self.max_retries


@dataclass
class QualityScore:
    """Quality assessment score for a document."""

    document_id: str
    overall_score: float
    completeness_score: float
    accuracy_score: float
    consistency_score: float
    assessed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    details: dict = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "document_id": self.document_id,
            "overall_score": self.overall_score,
            "completeness_score": self.completeness_score,
            "accuracy_score": self.accuracy_score,
            "consistency_score": self.consistency_score,
            "assessed_at": self.assessed_at.isoformat(),
            "details": self.details,
            "flags": self.flags,
        }

    @property
    def requires_review(self) -> bool:
        """Check if document requires manual review."""
        return self.overall_score < 0.6 or len(self.flags) > 0


@dataclass
class IntegrityIssue:
    """Represents a data integrity issue."""

    issue_type: str
    source_id: str
    target_id: Optional[str]
    message: str
    severity: str  # "error", "warning", "info"
    detected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    resolved: bool = False

    def to_dict(self) -> dict:
        return {
            "issue_type": self.issue_type,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "message": self.message,
            "severity": self.severity,
            "detected_at": self.detected_at.isoformat(),
            "resolved": self.resolved,
        }


class DocumentQuarantine:
    """Manages quarantined documents that failed processing.

    Implements Requirement 12.6: Flag documents with missing critical
    elements for manual review.
    """

    def __init__(self, max_quarantine_size: int = 10000):
        """Initialize document quarantine.

        Args:
            max_quarantine_size: Maximum number of documents to keep in quarantine.
        """
        self._quarantine: dict[str, QuarantinedDocument] = {}
        self._max_size = max_quarantine_size

    def quarantine(
        self,
        document_id: str,
        reason: QuarantineReason,
        message: str,
        content: Optional[bytes] = None,
        metadata: Optional[dict] = None,
    ) -> QuarantinedDocument:
        """Add a document to quarantine.

        Args:
            document_id: ID of the document.
            reason: Reason for quarantine.
            message: Detailed message about the issue.
            content: Optional original content.
            metadata: Optional metadata about the document.

        Returns:
            QuarantinedDocument record.
        """
        doc = QuarantinedDocument(
            document_id=document_id,
            reason=reason,
            message=message,
            original_content=content,
            metadata=metadata or {},
        )

        self._quarantine[document_id] = doc

        # Enforce size limit
        if len(self._quarantine) > self._max_size:
            self._evict_oldest()

        logger.warning(
            "document_quarantined",
            document_id=document_id,
            reason=reason.value,
            message=message,
        )

        return doc

    def _evict_oldest(self) -> None:
        """Evict oldest resolved documents from quarantine."""
        # First try to evict resolved documents
        resolved = [
            (doc_id, doc)
            for doc_id, doc in self._quarantine.items()
            if doc.resolved
        ]
        if resolved:
            resolved.sort(key=lambda x: x[1].quarantined_at)
            oldest_id = resolved[0][0]
            del self._quarantine[oldest_id]
            return

        # If no resolved, evict oldest unresolved
        all_docs = list(self._quarantine.items())
        all_docs.sort(key=lambda x: x[1].quarantined_at)
        if all_docs:
            del self._quarantine[all_docs[0][0]]

    def get(self, document_id: str) -> Optional[QuarantinedDocument]:
        """Get a quarantined document by ID."""
        return self._quarantine.get(document_id)

    def is_quarantined(self, document_id: str) -> bool:
        """Check if a document is quarantined."""
        doc = self._quarantine.get(document_id)
        return doc is not None and not doc.resolved

    def release(
        self,
        document_id: str,
        resolution_notes: Optional[str] = None,
    ) -> bool:
        """Release a document from quarantine.

        Args:
            document_id: ID of the document.
            resolution_notes: Optional notes about resolution.

        Returns:
            True if document was released.
        """
        doc = self._quarantine.get(document_id)
        if not doc:
            return False

        doc.resolved = True
        doc.resolved_at = datetime.now(timezone.utc)
        doc.resolution_notes = resolution_notes

        logger.info(
            "document_released",
            document_id=document_id,
            resolution_notes=resolution_notes,
        )

        return True

    def increment_retry(self, document_id: str) -> bool:
        """Increment retry count for a quarantined document.

        Args:
            document_id: ID of the document.

        Returns:
            True if retry count was incremented.
        """
        doc = self._quarantine.get(document_id)
        if not doc or doc.resolved:
            return False

        doc.retry_count += 1
        return True

    def get_pending_retries(self) -> list[QuarantinedDocument]:
        """Get documents that can be retried."""
        return [
            doc for doc in self._quarantine.values()
            if doc.can_retry()
        ]

    def get_by_reason(self, reason: QuarantineReason) -> list[QuarantinedDocument]:
        """Get quarantined documents by reason."""
        return [
            doc for doc in self._quarantine.values()
            if doc.reason == reason and not doc.resolved
        ]

    def get_statistics(self) -> dict:
        """Get quarantine statistics."""
        total = len(self._quarantine)
        resolved = sum(1 for d in self._quarantine.values() if d.resolved)
        by_reason = {}
        for doc in self._quarantine.values():
            if not doc.resolved:
                by_reason[doc.reason.value] = by_reason.get(doc.reason.value, 0) + 1

        return {
            "total": total,
            "active": total - resolved,
            "resolved": resolved,
            "by_reason": by_reason,
        }


class QualityScorer:
    """Calculates quality scores for documents.

    Implements quality scoring mechanism for Requirement 12.6.
    """

    # Weights for different quality dimensions
    WEIGHTS = {
        "completeness": 0.35,
        "accuracy": 0.35,
        "consistency": 0.30,
    }

    # Thresholds for flagging
    THRESHOLDS = {
        "low_overall": 0.6,
        "low_completeness": 0.5,
        "low_accuracy": 0.5,
        "low_consistency": 0.5,
    }

    def __init__(self):
        """Initialize quality scorer."""
        self._scores: dict[str, QualityScore] = {}

    def calculate_score(
        self,
        document_id: str,
        completeness_factors: dict[str, bool],
        accuracy_factors: dict[str, float],
        consistency_factors: dict[str, bool],
    ) -> QualityScore:
        """Calculate quality score for a document.

        Args:
            document_id: ID of the document.
            completeness_factors: Dict of completeness checks (name -> passed).
            accuracy_factors: Dict of accuracy scores (name -> score 0-1).
            consistency_factors: Dict of consistency checks (name -> passed).

        Returns:
            QualityScore for the document.
        """
        # Calculate completeness score
        if completeness_factors:
            completeness = sum(completeness_factors.values()) / len(completeness_factors)
        else:
            completeness = 0.0

        # Calculate accuracy score
        if accuracy_factors:
            accuracy = sum(accuracy_factors.values()) / len(accuracy_factors)
        else:
            accuracy = 0.0

        # Calculate consistency score
        if consistency_factors:
            consistency = sum(consistency_factors.values()) / len(consistency_factors)
        else:
            consistency = 0.0

        # Calculate weighted overall score
        overall = (
            self.WEIGHTS["completeness"] * completeness +
            self.WEIGHTS["accuracy"] * accuracy +
            self.WEIGHTS["consistency"] * consistency
        )

        # Determine flags
        flags = []
        if overall < self.THRESHOLDS["low_overall"]:
            flags.append("low_overall_quality")
        if completeness < self.THRESHOLDS["low_completeness"]:
            flags.append("incomplete_content")
        if accuracy < self.THRESHOLDS["low_accuracy"]:
            flags.append("accuracy_concerns")
        if consistency < self.THRESHOLDS["low_consistency"]:
            flags.append("consistency_issues")

        score = QualityScore(
            document_id=document_id,
            overall_score=overall,
            completeness_score=completeness,
            accuracy_score=accuracy,
            consistency_score=consistency,
            details={
                "completeness_factors": completeness_factors,
                "accuracy_factors": accuracy_factors,
                "consistency_factors": consistency_factors,
            },
            flags=flags,
        )

        self._scores[document_id] = score

        logger.info(
            "quality_score_calculated",
            document_id=document_id,
            overall_score=overall,
            flags=flags,
        )

        return score

    def get_score(self, document_id: str) -> Optional[QualityScore]:
        """Get quality score for a document."""
        return self._scores.get(document_id)

    def get_documents_requiring_review(self) -> list[QualityScore]:
        """Get all documents requiring manual review."""
        return [s for s in self._scores.values() if s.requires_review]

    def get_low_quality_documents(
        self, threshold: float = 0.6
    ) -> list[QualityScore]:
        """Get documents below quality threshold."""
        return [
            s for s in self._scores.values()
            if s.overall_score < threshold
        ]


class GraphIntegrityChecker:
    """Checks referential integrity in the graph database.

    Implements Requirement 12.7: Maintain referential integrity between
    related documents and detect orphaned references.
    """

    def __init__(self):
        """Initialize integrity checker."""
        self._known_nodes: dict[str, set[str]] = {
            "Document": set(),
            "Regulator": set(),
            "Requirement": set(),
            "Form": set(),
            "Section": set(),
        }
        self._relationships: list[tuple[str, str, str, str]] = []  # (source_type, source_id, target_type, target_id)
        self._issues: list[IntegrityIssue] = []

    def register_node(self, node_type: str, node_id: str) -> None:
        """Register a node as existing in the graph.

        Args:
            node_type: Type of node (Document, Regulator, etc.).
            node_id: ID of the node.
        """
        if node_type in self._known_nodes:
            self._known_nodes[node_type].add(node_id)

    def register_relationship(
        self,
        source_type: str,
        source_id: str,
        target_type: str,
        target_id: str,
    ) -> None:
        """Register a relationship between nodes.

        Args:
            source_type: Type of source node.
            source_id: ID of source node.
            target_type: Type of target node.
            target_id: ID of target node.
        """
        self._relationships.append((source_type, source_id, target_type, target_id))

    def check_integrity(self) -> list[IntegrityIssue]:
        """Check for integrity issues in the graph.

        Returns:
            List of integrity issues found.
        """
        self._issues.clear()

        # Check for orphaned references
        self._check_orphaned_references()

        # Check for missing required relationships
        self._check_required_relationships()

        # Check for duplicate nodes
        self._check_duplicates()

        logger.info(
            "integrity_check_complete",
            issues_found=len(self._issues),
        )

        return self._issues

    def _check_orphaned_references(self) -> None:
        """Check for relationships pointing to non-existent nodes."""
        for source_type, source_id, target_type, target_id in self._relationships:
            # Check source exists
            if source_id not in self._known_nodes.get(source_type, set()):
                self._issues.append(IntegrityIssue(
                    issue_type="orphaned_source",
                    source_id=source_id,
                    target_id=target_id,
                    message=f"Relationship source {source_type}:{source_id} does not exist",
                    severity="error",
                ))

            # Check target exists
            if target_id not in self._known_nodes.get(target_type, set()):
                self._issues.append(IntegrityIssue(
                    issue_type="orphaned_target",
                    source_id=source_id,
                    target_id=target_id,
                    message=f"Relationship target {target_type}:{target_id} does not exist",
                    severity="error",
                ))

    def _check_required_relationships(self) -> None:
        """Check that documents have required relationships."""
        # Every document should have an ISSUED_BY relationship to a regulator
        documents_with_regulator = set()
        for source_type, source_id, target_type, _ in self._relationships:
            if source_type == "Document" and target_type == "Regulator":
                documents_with_regulator.add(source_id)

        for doc_id in self._known_nodes.get("Document", set()):
            if doc_id not in documents_with_regulator:
                self._issues.append(IntegrityIssue(
                    issue_type="missing_relationship",
                    source_id=doc_id,
                    target_id=None,
                    message=f"Document {doc_id} has no ISSUED_BY relationship to a Regulator",
                    severity="warning",
                ))

    def _check_duplicates(self) -> None:
        """Check for potential duplicate nodes."""
        # This is a placeholder - in practice, would check for similar titles, etc.
        pass

    def find_orphaned_documents(self) -> list[str]:
        """Find documents with no incoming references.

        Returns:
            List of document IDs with no incoming references.
        """
        referenced_docs = set()
        for _, _, target_type, target_id in self._relationships:
            if target_type == "Document":
                referenced_docs.add(target_id)

        # Documents that are sources but never targets
        source_docs = set()
        for source_type, source_id, _, _ in self._relationships:
            if source_type == "Document":
                source_docs.add(source_id)

        all_docs = self._known_nodes.get("Document", set())
        orphaned = all_docs - referenced_docs - source_docs

        return list(orphaned)

    def get_issues_by_severity(self, severity: str) -> list[IntegrityIssue]:
        """Get issues filtered by severity."""
        return [i for i in self._issues if i.severity == severity]

    def clear(self) -> None:
        """Clear all registered nodes and relationships."""
        for node_set in self._known_nodes.values():
            node_set.clear()
        self._relationships.clear()
        self._issues.clear()


class DataConsistencyValidator:
    """Validates data consistency across storage layers.

    Ensures documents in S3, graph database, and vector store are consistent.
    """

    def __init__(self):
        """Initialize consistency validator."""
        self._s3_documents: set[str] = set()
        self._graph_documents: set[str] = set()
        self._vector_documents: set[str] = set()
        self._inconsistencies: list[dict] = []

    def register_s3_document(self, document_id: str) -> None:
        """Register a document in S3."""
        self._s3_documents.add(document_id)

    def register_graph_document(self, document_id: str) -> None:
        """Register a document in graph store."""
        self._graph_documents.add(document_id)

    def register_vector_document(self, document_id: str) -> None:
        """Register a document in vector store."""
        self._vector_documents.add(document_id)

    def check_consistency(self) -> list[dict]:
        """Check consistency across storage layers.

        Returns:
            List of inconsistency issues.
        """
        self._inconsistencies.clear()

        # Documents in S3 but not in graph
        s3_only = self._s3_documents - self._graph_documents
        for doc_id in s3_only:
            self._inconsistencies.append({
                "type": "missing_in_graph",
                "document_id": doc_id,
                "message": f"Document {doc_id} exists in S3 but not in graph store",
                "severity": "error",
            })

        # Documents in graph but not in S3
        graph_only = self._graph_documents - self._s3_documents
        for doc_id in graph_only:
            self._inconsistencies.append({
                "type": "missing_in_s3",
                "document_id": doc_id,
                "message": f"Document {doc_id} exists in graph but not in S3",
                "severity": "error",
            })

        # Documents in graph but not in vector store
        graph_not_vector = self._graph_documents - self._vector_documents
        for doc_id in graph_not_vector:
            self._inconsistencies.append({
                "type": "missing_in_vector",
                "document_id": doc_id,
                "message": f"Document {doc_id} exists in graph but not in vector store",
                "severity": "warning",
            })

        logger.info(
            "consistency_check_complete",
            inconsistencies_found=len(self._inconsistencies),
        )

        return self._inconsistencies

    def get_consistent_documents(self) -> set[str]:
        """Get documents that exist in all storage layers."""
        return self._s3_documents & self._graph_documents & self._vector_documents

    def get_statistics(self) -> dict:
        """Get consistency statistics."""
        all_docs = self._s3_documents | self._graph_documents | self._vector_documents
        consistent = self.get_consistent_documents()

        return {
            "total_unique_documents": len(all_docs),
            "s3_documents": len(self._s3_documents),
            "graph_documents": len(self._graph_documents),
            "vector_documents": len(self._vector_documents),
            "fully_consistent": len(consistent),
            "consistency_rate": len(consistent) / len(all_docs) if all_docs else 1.0,
        }

    def clear(self) -> None:
        """Clear all registered documents."""
        self._s3_documents.clear()
        self._graph_documents.clear()
        self._vector_documents.clear()
        self._inconsistencies.clear()


class ManualReviewQueue:
    """Queue for documents requiring manual review.

    Implements Requirement 12.6: Flag documents with missing critical
    elements for manual review.
    """

    @dataclass
    class ReviewItem:
        """Item in the review queue."""

        document_id: str
        reason: str
        priority: int  # 1 = highest, 5 = lowest
        added_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
        assigned_to: Optional[str] = None
        status: str = "pending"  # pending, in_review, approved, rejected
        notes: list[str] = field(default_factory=list)

        def to_dict(self) -> dict:
            return {
                "document_id": self.document_id,
                "reason": self.reason,
                "priority": self.priority,
                "added_at": self.added_at.isoformat(),
                "assigned_to": self.assigned_to,
                "status": self.status,
                "notes": self.notes,
            }

    def __init__(self):
        """Initialize review queue."""
        self._queue: dict[str, ManualReviewQueue.ReviewItem] = {}

    def add(
        self,
        document_id: str,
        reason: str,
        priority: int = 3,
    ) -> "ManualReviewQueue.ReviewItem":
        """Add a document to the review queue.

        Args:
            document_id: ID of the document.
            reason: Reason for review.
            priority: Priority level (1-5).

        Returns:
            ReviewItem for the document.
        """
        item = self.ReviewItem(
            document_id=document_id,
            reason=reason,
            priority=max(1, min(5, priority)),
        )
        self._queue[document_id] = item

        logger.info(
            "document_queued_for_review",
            document_id=document_id,
            reason=reason,
            priority=priority,
        )

        return item

    def get(self, document_id: str) -> Optional["ManualReviewQueue.ReviewItem"]:
        """Get a review item by document ID."""
        return self._queue.get(document_id)

    def assign(self, document_id: str, reviewer: str) -> bool:
        """Assign a document to a reviewer.

        Args:
            document_id: ID of the document.
            reviewer: Reviewer identifier.

        Returns:
            True if assignment was successful.
        """
        item = self._queue.get(document_id)
        if not item:
            return False

        item.assigned_to = reviewer
        item.status = "in_review"
        return True

    def approve(self, document_id: str, notes: Optional[str] = None) -> bool:
        """Approve a document after review.

        Args:
            document_id: ID of the document.
            notes: Optional review notes.

        Returns:
            True if approval was successful.
        """
        item = self._queue.get(document_id)
        if not item:
            return False

        item.status = "approved"
        if notes:
            item.notes.append(f"Approved: {notes}")
        return True

    def reject(self, document_id: str, reason: str) -> bool:
        """Reject a document after review.

        Args:
            document_id: ID of the document.
            reason: Reason for rejection.

        Returns:
            True if rejection was successful.
        """
        item = self._queue.get(document_id)
        if not item:
            return False

        item.status = "rejected"
        item.notes.append(f"Rejected: {reason}")
        return True

    def get_pending(self, limit: int = 100) -> list["ManualReviewQueue.ReviewItem"]:
        """Get pending review items sorted by priority."""
        pending = [
            item for item in self._queue.values()
            if item.status == "pending"
        ]
        pending.sort(key=lambda x: (x.priority, x.added_at))
        return pending[:limit]

    def get_statistics(self) -> dict:
        """Get queue statistics."""
        statuses = {}
        for item in self._queue.values():
            statuses[item.status] = statuses.get(item.status, 0) + 1

        return {
            "total": len(self._queue),
            "by_status": statuses,
        }
