"""
Audit trail models for the Agentic Data Governance System.

This module defines Pydantic models for audit entries and related types,
including hash-chained immutable audit entries for tamper-evident logging.

Requirements: 2.8, 36.1, 36.2, 36.3, 36.4
"""

from datetime import datetime
from typing import Any, Literal, Optional, List
from pydantic import BaseModel, Field
from uuid import uuid4
import hashlib
import json


# Type alias
ActorType = Literal['agent', 'human', 'system']


class AuditEntry(BaseModel):
    """
    Represents an entry in the audit log.
    
    Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    timestamp: datetime = Field(default_factory=datetime.now)
    actor: str
    actor_type: ActorType
    action: str
    entity_type: str
    entity_id: str
    previous_state: Optional[Any] = None
    new_state: Optional[Any] = None
    rationale: Optional[str] = None


class ImmutableAuditEntry(BaseModel):
    """
    Represents a hash-chained immutable audit entry for tamper-evident logging.
    
    Each entry includes a SHA-256 hash computed from its content and the
    previous entry's hash, creating a blockchain-style chain that detects tampering.
    
    Validates: Requirements 36.1, 36.2
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    sequence_number: int = Field(description="Sequential position in the audit chain")
    tenant_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    actor: str
    actor_type: ActorType
    action: str
    entity_type: str
    entity_id: str
    previous_state: Optional[Any] = None
    new_state: Optional[Any] = None
    rationale: Optional[str] = None
    previous_hash: str = Field(description="SHA-256 hash of the previous entry (genesis block uses empty string)")
    entry_hash: str = Field(description="SHA-256 hash of this entry's content including previous_hash")
    
    @staticmethod
    def compute_hash(
        sequence_number: int,
        tenant_id: Optional[str],
        timestamp: datetime,
        actor: str,
        actor_type: str,
        action: str,
        entity_type: str,
        entity_id: str,
        previous_state: Optional[Any],
        new_state: Optional[Any],
        rationale: Optional[str],
        previous_hash: str
    ) -> str:
        """
        Compute SHA-256 hash of audit entry content.
        
        The hash includes all entry fields plus the previous entry's hash,
        creating a tamper-evident chain.
        
        Validates: Requirements 36.1
        """
        # Create a canonical JSON representation for consistent hashing
        content = {
            "sequence_number": sequence_number,
            "tenant_id": tenant_id,
            "timestamp": timestamp.isoformat(),
            "actor": actor,
            "actor_type": actor_type,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "previous_state": _serialize_state(previous_state),
            "new_state": _serialize_state(new_state),
            "rationale": rationale,
            "previous_hash": previous_hash
        }
        
        # Use sort_keys for deterministic JSON serialization
        content_str = json.dumps(content, sort_keys=True, default=str)
        return hashlib.sha256(content_str.encode('utf-8')).hexdigest()
    
    def verify_hash(self) -> bool:
        """
        Verify that the entry's hash matches its content.
        
        Returns:
            True if the hash is valid, False if tampered.
            
        Validates: Requirements 36.3
        """
        computed = self.compute_hash(
            sequence_number=self.sequence_number,
            tenant_id=self.tenant_id,
            timestamp=self.timestamp,
            actor=self.actor,
            actor_type=self.actor_type,
            action=self.action,
            entity_type=self.entity_type,
            entity_id=self.entity_id,
            previous_state=self.previous_state,
            new_state=self.new_state,
            rationale=self.rationale,
            previous_hash=self.previous_hash
        )
        return computed == self.entry_hash
    
    @classmethod
    def from_audit_entry(
        cls,
        entry: AuditEntry,
        sequence_number: int,
        previous_hash: str
    ) -> "ImmutableAuditEntry":
        """
        Create an ImmutableAuditEntry from a regular AuditEntry.
        
        Args:
            entry: The source audit entry
            sequence_number: Position in the chain
            previous_hash: Hash of the previous entry (empty string for genesis)
            
        Returns:
            A new ImmutableAuditEntry with computed hash
        """
        entry_hash = cls.compute_hash(
            sequence_number=sequence_number,
            tenant_id=entry.tenant_id,
            timestamp=entry.timestamp,
            actor=entry.actor,
            actor_type=entry.actor_type,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            previous_state=entry.previous_state,
            new_state=entry.new_state,
            rationale=entry.rationale,
            previous_hash=previous_hash
        )
        
        return cls(
            id=entry.id,
            sequence_number=sequence_number,
            tenant_id=entry.tenant_id,
            timestamp=entry.timestamp,
            actor=entry.actor,
            actor_type=entry.actor_type,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            previous_state=entry.previous_state,
            new_state=entry.new_state,
            rationale=entry.rationale,
            previous_hash=previous_hash,
            entry_hash=entry_hash
        )


class MerkleNode(BaseModel):
    """
    Represents a node in a Merkle tree for audit trail integrity proofs.
    
    Validates: Requirements 36.4
    """
    hash: str
    left_child: Optional[str] = None  # Hash of left child
    right_child: Optional[str] = None  # Hash of right child
    is_leaf: bool = False
    entry_id: Optional[str] = None  # Only set for leaf nodes


class MerkleProof(BaseModel):
    """
    Represents a Merkle proof for verifying an entry's inclusion in the audit trail.
    
    Validates: Requirements 36.4
    """
    entry_id: str
    entry_hash: str
    proof_path: List[tuple[str, str]] = Field(
        description="List of (hash, position) tuples where position is 'left' or 'right'"
    )
    merkle_root: str
    
    def verify(self) -> bool:
        """
        Verify that the entry is included in the Merkle tree.
        
        Returns:
            True if the proof is valid, False otherwise.
        """
        current_hash = self.entry_hash
        
        for sibling_hash, position in self.proof_path:
            if position == 'left':
                combined = sibling_hash + current_hash
            else:
                combined = current_hash + sibling_hash
            current_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()
        
        return current_hash == self.merkle_root


class AuditChainVerificationResult(BaseModel):
    """
    Result of verifying an audit chain's integrity.
    
    Validates: Requirements 36.3
    """
    is_valid: bool
    total_entries: int
    verified_entries: int
    first_invalid_sequence: Optional[int] = None
    error_message: Optional[str] = None
    merkle_root: Optional[str] = None


class AuditExport(BaseModel):
    """
    Represents an exported audit trail with integrity proofs.
    
    Validates: Requirements 36.4
    """
    entries: List[ImmutableAuditEntry]
    merkle_root: str
    export_timestamp: datetime = Field(default_factory=datetime.now)
    chain_start_sequence: int
    chain_end_sequence: int
    tenant_id: Optional[str] = None


class CreateAuditEntryParams(BaseModel):
    """Parameters for creating an audit entry."""
    actor: str
    actor_type: ActorType
    action: str
    entity_type: str
    entity_id: str
    previous_state: Optional[Any] = None
    new_state: Optional[Any] = None
    rationale: Optional[str] = None


def _serialize_state(state: Optional[Any]) -> Optional[str]:
    """
    Serialize state to a canonical string representation for hashing.
    
    Args:
        state: The state to serialize (can be dict, list, or primitive)
        
    Returns:
        JSON string representation or None if state is None
    """
    if state is None:
        return None
    try:
        return json.dumps(state, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return str(state)
