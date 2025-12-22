"""
Pytest configuration and shared fixtures for the agentcore-data-governance project.
"""
import pytest
from hypothesis import settings, Verbosity

# Configure Hypothesis settings for all property-based tests
settings.register_profile(
    "default",
    max_examples=100,
    deadline=5000,
    suppress_health_check=[],
    verbosity=Verbosity.normal,
)

settings.register_profile(
    "ci",
    max_examples=200,
    deadline=10000,
    suppress_health_check=[],
    verbosity=Verbosity.quiet,
)

settings.register_profile(
    "debug",
    max_examples=10,
    deadline=None,
    suppress_health_check=[],
    verbosity=Verbosity.verbose,
)

settings.load_profile("default")


@pytest.fixture
def in_memory_repository():
    """Provide a fresh in-memory repository for each test."""
    from repository.in_memory import InMemoryGovernanceRepository
    return InMemoryGovernanceRepository()
