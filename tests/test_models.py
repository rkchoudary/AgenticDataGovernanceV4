"""Tests for core data models."""

import pytest
from datetime import date, datetime

from regulatory_kb.models import (
    Document,
    DocumentMetadata,
    DocumentContent,
    Regulator,
    RegulatorType,
    Country,
    RegulatoryRequirement,
    Deadline,
    FilingFrequency,
    GraphRelationship,
    RelationshipType,
)
from regulatory_kb.models.document import DocumentType, DocumentCategory
from regulatory_kb.models.regulator import US_REGULATORS, CA_REGULATORS, ALL_REGULATORS


class TestRegulator:
    """Tests for Regulator model."""

    def test_create_regulator(self):
        regulator = Regulator(
            id="test_reg",
            name="Test Regulator",
            abbreviation="TR",
            country=Country.US,
            regulator_type=RegulatorType.PRUDENTIAL,
            website="https://test.gov",
        )
        assert regulator.id == "test_reg"
        assert regulator.abbreviation == "TR"
        assert regulator.country == Country.US

    def test_predefined_us_regulators(self):
        assert "frb" in US_REGULATORS
        assert "occ" in US_REGULATORS
        assert "fdic" in US_REGULATORS
        assert "fincen" in US_REGULATORS
        assert US_REGULATORS["frb"].abbreviation == "FRB"

    def test_predefined_ca_regulators(self):
        assert "osfi" in CA_REGULATORS
        assert "fintrac" in CA_REGULATORS
        assert CA_REGULATORS["osfi"].country == Country.CA

    def test_all_regulators_combined(self):
        assert len(ALL_REGULATORS) == 6


class TestDocument:
    """Tests for Document model."""

    def test_create_document(self):
        doc = Document(
            id="us_frb_fry14a_2024",
            title="FR Y-14A Instructions",
            document_type=DocumentType.INSTRUCTION_MANUAL,
            regulator_id="us_frb",
            source_url="https://federalreserve.gov/fry14a",
        )
        assert doc.id == "us_frb_fry14a_2024"
        assert doc.document_type == DocumentType.INSTRUCTION_MANUAL

    def test_document_with_metadata(self):
        metadata = DocumentMetadata(
            form_number="FR Y-14A",
            omb_control_number="7100-0341",
            effective_date=date(2024, 1, 1),
            filing_frequency=FilingFrequency.ANNUAL,
        )
        doc = Document(
            id="test_doc",
            title="Test Document",
            document_type=DocumentType.REGULATION,
            regulator_id="us_frb",
            source_url="https://test.gov",
            metadata=metadata,
        )
        assert doc.metadata.form_number == "FR Y-14A"
        assert doc.metadata.filing_frequency == FilingFrequency.ANNUAL

    def test_document_categories(self):
        doc = Document(
            id="test_doc",
            title="Test Document",
            document_type=DocumentType.GUIDANCE,
            regulator_id="us_frb",
            source_url="https://test.gov",
            categories=[
                DocumentCategory.CAPITAL_REQUIREMENTS,
                DocumentCategory.STRESS_TESTING,
            ],
        )
        assert len(doc.categories) == 2
        assert DocumentCategory.CAPITAL_REQUIREMENTS in doc.categories


class TestRegulatoryRequirement:
    """Tests for RegulatoryRequirement model."""

    def test_create_requirement(self):
        deadline = Deadline(
            frequency=FilingFrequency.ANNUAL,
            due_date="April 5",
            submission_window="January 1 - April 5",
        )
        req = RegulatoryRequirement(
            id="ccar_capital_plan_2024",
            description="Annual capital plan submission under CCAR",
            regulator_id="us_frb",
            deadline=deadline,
        )
        assert req.id == "ccar_capital_plan_2024"
        assert req.deadline.frequency == FilingFrequency.ANNUAL


class TestGraphRelationship:
    """Tests for GraphRelationship model."""

    def test_create_relationship(self):
        rel = GraphRelationship(
            source_node="doc_1",
            target_node="doc_2",
            relationship_type=RelationshipType.IMPLEMENTS,
            strength=0.95,
        )
        assert rel.source_node == "doc_1"
        assert rel.relationship_type == RelationshipType.IMPLEMENTS
        assert rel.strength == 0.95

    def test_relationship_types(self):
        assert RelationshipType.ISSUED_BY.value == "ISSUED_BY"
        assert RelationshipType.REFERENCES.value == "REFERENCES"
        assert RelationshipType.SUPERSEDES.value == "SUPERSEDES"
