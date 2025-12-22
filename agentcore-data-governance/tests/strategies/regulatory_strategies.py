"""
Hypothesis strategies for regulatory models.

Contains test data generators for regulatory-related Pydantic models.

**Feature: agentcore-python-refactor, Property 1: Artifact Review State Invariant**
**Validates: Requirements 1.3, 3.5, 4.4, 10.3**
"""

from datetime import datetime, timedelta
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.regulatory import (
    DueDateRule,
    RegulatoryReport,
    ReportCatalog,
    RegulatoryChange,
    ScanResult,
    CatalogUpdate,
    ArtifactStatus,
    Jurisdiction,
    ReportFrequency,
    ChangeType,
)


# Basic strategies
jurisdiction_strategy = st.sampled_from(['US', 'CA'])
frequency_strategy = st.sampled_from(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])
artifact_status_strategy = st.sampled_from(['draft', 'pending_review', 'approved', 'rejected'])
change_type_strategy = st.sampled_from(['new', 'updated', 'removed'])


@composite
def due_date_rule_strategy(draw):
    """Generate a DueDateRule."""
    return DueDateRule(
        days_after_period_end=draw(st.integers(min_value=1, max_value=90)),
        business_days_only=draw(st.booleans()),
        timezone=draw(st.sampled_from(['UTC', 'America/New_York', 'America/Toronto']))
    )


@composite
def regulatory_report_strategy(draw):
    """Generate a RegulatoryReport."""
    return RegulatoryReport(
        id=draw(st.uuids().map(str)),
        name=draw(st.text(min_size=1, max_size=100, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z')))),
        jurisdiction=draw(jurisdiction_strategy),
        regulator=draw(st.sampled_from(['OSFI', 'Federal Reserve', 'OCC', 'FDIC', 'SEC'])),
        frequency=draw(frequency_strategy),
        due_date=draw(due_date_rule_strategy()),
        submission_format=draw(st.sampled_from(['XML', 'XBRL', 'CSV', 'PDF', 'JSON'])),
        submission_platform=draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N')))),
        description=draw(st.text(min_size=10, max_size=500, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z')))),
        template_url=draw(st.none() | st.just("https://example.com/template")),
        last_updated=draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31))),
        responsible_unit=draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))))
    )


@composite
def report_catalog_strategy(draw, status: ArtifactStatus = None):
    """
    Generate a ReportCatalog.
    
    Args:
        status: Optional specific status to use. If None, generates random status.
    """
    actual_status = status if status else draw(artifact_status_strategy)
    
    catalog = ReportCatalog(
        reports=draw(st.lists(regulatory_report_strategy(), min_size=0, max_size=10)),
        version=draw(st.integers(min_value=0, max_value=1000)),
        last_scanned=draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31))),
        status=actual_status
    )
    
    # If approved, add approval info
    if actual_status == 'approved':
        catalog.approved_by = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N'))))
        catalog.approved_at = draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31)))
    
    return catalog


@composite
def regulatory_change_strategy(draw):
    """Generate a RegulatoryChange."""
    return RegulatoryChange(
        id=draw(st.uuids().map(str)),
        report_id=draw(st.none() | st.uuids().map(str)),
        change_type=draw(change_type_strategy),
        description=draw(st.text(min_size=10, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z')))),
        effective_date=draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31))),
        detected_at=draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31))),
        source=draw(st.sampled_from(['OSFI', 'Federal Reserve', 'OCC', 'FDIC', 'SEC']))
    )


# Non-empty string strategy for names and identifiers
non_empty_string_strategy = st.text(min_size=1, max_size=100, alphabet=st.characters(whitelist_categories=('L', 'N')))
