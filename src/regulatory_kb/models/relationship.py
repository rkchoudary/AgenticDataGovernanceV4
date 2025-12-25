"""Graph relationship data models."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    """Types of relationships between graph nodes."""

    ISSUED_BY = "ISSUED_BY"
    IMPLEMENTS = "IMPLEMENTS"
    REFERENCES = "REFERENCES"
    DESCRIBED_IN = "DESCRIBED_IN"
    PART_OF = "PART_OF"
    SUPERSEDES = "SUPERSEDES"
    AMENDS = "AMENDS"
    RELATED_TO = "RELATED_TO"
    # Chunk relationships
    CHUNK_OF = "CHUNK_OF"  # Chunk -> Document
    NEXT_CHUNK = "NEXT_CHUNK"  # Chunk -> Chunk
    PREVIOUS_CHUNK = "PREVIOUS_CHUNK"  # Chunk -> Chunk


class GraphRelationship(BaseModel):
    """Represents a relationship between two nodes in the graph database."""

    source_node: str = Field(..., description="Source node ID")
    target_node: str = Field(..., description="Target node ID")
    relationship_type: RelationshipType = Field(..., description="Type of relationship")
    properties: dict = Field(
        default_factory=dict, description="Additional relationship properties"
    )
    strength: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="Relationship strength score"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    validated: bool = Field(default=False, description="Whether relationship is validated")
