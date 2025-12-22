"""
Append-only storage adapter for immutable audit entries.

This module provides a hash-chained, append-only audit trail implementation
that ensures tamper-evident logging for regulatory compliance.

Requirements: 36.1, 36.2, 36.3, 36.4
"""

from datetime import datetime
from typing import Optional, List
from copy import deepcopy
import hashlib

from models.audit import (
    AuditEntry,
    ImmutableAuditEntry,
    CreateAuditEntryParams,
    MerkleProof,
    AuditChainVerificationResult,
    AuditExport,
)


# Genesis block hash - used as previous_hash for the first entry
GENESIS_HASH = "0" * 64  # 64 zeros representing empty SHA-256


class ImmutableAuditStore:
    """
    Append-only storage for hash-chained immutable audit entries.
    
    This implementation provides:
    - SHA-256 hash chaining (blockchain-style)
    - Append-only operations (no update/delete)
    - Hash chain verification
    - Merkle tree proof generation for exports
    
    Validates: Requirements 36.1, 36.2, 36.3, 36.4
    """
    
    def __init__(self, tenant_id: Optional[str] = None):
        """
        Initialize the immutable audit store.
        
        Args:
            tenant_id: Optional tenant ID for multi-tenant isolation
        """
        self._entries: List[ImmutableAuditEntry] = []
        self._tenant_id = tenant_id
        self._sequence_counter = 0
    
    @property
    def last_hash(self) -> str:
        """Get the hash of the last entry, or genesis hash if empty."""
        if not self._entries:
            return GENESIS_HASH
        return self._entries[-1].entry_hash
    
    @property
    def entry_count(self) -> int:
        """Get the total number of entries in the chain."""
        return len(self._entries)
    
    def append(self, entry: AuditEntry) -> ImmutableAuditEntry:
        """
        Append a new audit entry to the chain.
        
        This is the ONLY way to add entries - no update or delete operations
        are supported to maintain immutability.
        
        Args:
            entry: The audit entry to append
            
        Returns:
            The created ImmutableAuditEntry with computed hash
            
        Validates: Requirements 36.1, 36.2
        """
        # Set tenant_id if not already set
        if entry.tenant_id is None and self._tenant_id is not None:
            entry.tenant_id = self._tenant_id
        
        # Create immutable entry with hash chain
        immutable_entry = ImmutableAuditEntry.from_audit_entry(
            entry=entry,
            sequence_number=self._sequence_counter,
            previous_hash=self.last_hash
        )
        
        # Append to chain (no update/delete allowed)
        self._entries.append(immutable_entry)
        self._sequence_counter += 1
        
        return deepcopy(immutable_entry)
    
    def append_from_params(self, params: CreateAuditEntryParams) -> ImmutableAuditEntry:
        """
        Create and append an audit entry from parameters.
        
        Args:
            params: Parameters for creating the audit entry
            
        Returns:
            The created ImmutableAuditEntry
        """
        entry = AuditEntry(
            timestamp=datetime.now(),
            tenant_id=self._tenant_id,
            actor=params.actor,
            actor_type=params.actor_type,
            action=params.action,
            entity_type=params.entity_type,
            entity_id=params.entity_id,
            previous_state=params.previous_state,
            new_state=params.new_state,
            rationale=params.rationale,
        )
        return self.append(entry)
    
    def get_entry(self, sequence_number: int) -> Optional[ImmutableAuditEntry]:
        """
        Get an entry by sequence number.
        
        Args:
            sequence_number: The sequence number of the entry
            
        Returns:
            The entry if found, None otherwise
        """
        if 0 <= sequence_number < len(self._entries):
            return deepcopy(self._entries[sequence_number])
        return None
    
    def get_entry_by_id(self, entry_id: str) -> Optional[ImmutableAuditEntry]:
        """
        Get an entry by its ID.
        
        Args:
            entry_id: The unique ID of the entry
            
        Returns:
            The entry if found, None otherwise
        """
        for entry in self._entries:
            if entry.id == entry_id:
                return deepcopy(entry)
        return None
    
    def get_entries(
        self,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        actor: Optional[str] = None,
        action: Optional[str] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[ImmutableAuditEntry]:
        """
        Get entries with optional filters.
        
        Args:
            entity_type: Filter by entity type
            entity_id: Filter by entity ID
            actor: Filter by actor
            action: Filter by action
            since: Filter entries after this datetime
            until: Filter entries before this datetime
            limit: Maximum number of entries to return
            
        Returns:
            List of matching entries (most recent first)
        """
        entries = self._entries
        
        if entity_type:
            entries = [e for e in entries if e.entity_type == entity_type]
        
        if entity_id:
            entries = [e for e in entries if e.entity_id == entity_id]
        
        if actor:
            entries = [e for e in entries if e.actor == actor]
        
        if action:
            entries = [e for e in entries if e.action == action]
        
        if since:
            entries = [e for e in entries if e.timestamp >= since]
        
        if until:
            entries = [e for e in entries if e.timestamp <= until]
        
        # Sort by sequence number descending (most recent first)
        entries = sorted(entries, key=lambda e: e.sequence_number, reverse=True)
        
        if limit:
            entries = entries[:limit]
        
        return [deepcopy(e) for e in entries]
    
    def verify_chain(
        self,
        start_sequence: Optional[int] = None,
        end_sequence: Optional[int] = None
    ) -> AuditChainVerificationResult:
        """
        Verify the integrity of the hash chain.
        
        Checks that:
        1. Each entry's hash matches its content
        2. Each entry's previous_hash matches the previous entry's hash
        
        Args:
            start_sequence: Starting sequence number (default: 0)
            end_sequence: Ending sequence number (default: last entry)
            
        Returns:
            Verification result with details
            
        Validates: Requirements 36.3
        """
        if not self._entries:
            return AuditChainVerificationResult(
                is_valid=True,
                total_entries=0,
                verified_entries=0,
                merkle_root=None
            )
        
        start = start_sequence if start_sequence is not None else 0
        end = end_sequence if end_sequence is not None else len(self._entries) - 1
        
        # Validate range
        if start < 0 or end >= len(self._entries) or start > end:
            return AuditChainVerificationResult(
                is_valid=False,
                total_entries=len(self._entries),
                verified_entries=0,
                error_message=f"Invalid sequence range: {start} to {end}"
            )
        
        verified_count = 0
        expected_previous_hash = GENESIS_HASH if start == 0 else self._entries[start - 1].entry_hash
        
        for i in range(start, end + 1):
            entry = self._entries[i]
            
            # Verify previous hash chain
            if entry.previous_hash != expected_previous_hash:
                return AuditChainVerificationResult(
                    is_valid=False,
                    total_entries=end - start + 1,
                    verified_entries=verified_count,
                    first_invalid_sequence=i,
                    error_message=f"Chain broken at sequence {i}: previous_hash mismatch"
                )
            
            # Verify entry's own hash
            if not entry.verify_hash():
                return AuditChainVerificationResult(
                    is_valid=False,
                    total_entries=end - start + 1,
                    verified_entries=verified_count,
                    first_invalid_sequence=i,
                    error_message=f"Hash verification failed at sequence {i}: content tampered"
                )
            
            expected_previous_hash = entry.entry_hash
            verified_count += 1
        
        # Compute Merkle root for the verified range
        merkle_root = self._compute_merkle_root(start, end)
        
        return AuditChainVerificationResult(
            is_valid=True,
            total_entries=end - start + 1,
            verified_entries=verified_count,
            merkle_root=merkle_root
        )
    
    def generate_merkle_proof(self, entry_id: str) -> Optional[MerkleProof]:
        """
        Generate a Merkle proof for a specific entry.
        
        The proof allows verification that an entry is included in the
        audit trail without needing the entire chain.
        
        Args:
            entry_id: The ID of the entry to generate proof for
            
        Returns:
            MerkleProof if entry found, None otherwise
            
        Validates: Requirements 36.4
        """
        # Find the entry
        entry_index = None
        for i, entry in enumerate(self._entries):
            if entry.id == entry_id:
                entry_index = i
                break
        
        if entry_index is None:
            return None
        
        entry = self._entries[entry_index]
        
        # Build Merkle tree and generate proof
        if not self._entries:
            return None
        
        # Get leaf hashes
        leaf_hashes = [e.entry_hash for e in self._entries]
        
        # Build proof path
        proof_path = self._build_merkle_proof_path(leaf_hashes, entry_index)
        merkle_root = self._compute_merkle_root(0, len(self._entries) - 1)
        
        return MerkleProof(
            entry_id=entry_id,
            entry_hash=entry.entry_hash,
            proof_path=proof_path,
            merkle_root=merkle_root
        )
    
    def export_with_proofs(
        self,
        start_sequence: Optional[int] = None,
        end_sequence: Optional[int] = None
    ) -> AuditExport:
        """
        Export audit entries with Merkle tree integrity proofs.
        
        Args:
            start_sequence: Starting sequence number (default: 0)
            end_sequence: Ending sequence number (default: last entry)
            
        Returns:
            AuditExport with entries and Merkle root
            
        Validates: Requirements 36.4
        """
        start = start_sequence if start_sequence is not None else 0
        end = end_sequence if end_sequence is not None else max(0, len(self._entries) - 1)
        
        if not self._entries or start > end:
            return AuditExport(
                entries=[],
                merkle_root=GENESIS_HASH,
                chain_start_sequence=start,
                chain_end_sequence=end,
                tenant_id=self._tenant_id
            )
        
        # Clamp to valid range
        start = max(0, start)
        end = min(end, len(self._entries) - 1)
        
        entries = [deepcopy(self._entries[i]) for i in range(start, end + 1)]
        merkle_root = self._compute_merkle_root(start, end)
        
        return AuditExport(
            entries=entries,
            merkle_root=merkle_root,
            chain_start_sequence=start,
            chain_end_sequence=end,
            tenant_id=self._tenant_id
        )
    
    def _compute_merkle_root(self, start: int, end: int) -> str:
        """
        Compute the Merkle root for a range of entries.
        
        Args:
            start: Starting sequence number
            end: Ending sequence number
            
        Returns:
            The Merkle root hash
        """
        if start > end or not self._entries:
            return GENESIS_HASH
        
        # Get leaf hashes for the range
        hashes = [self._entries[i].entry_hash for i in range(start, end + 1)]
        
        if not hashes:
            return GENESIS_HASH
        
        # Build Merkle tree bottom-up
        while len(hashes) > 1:
            next_level = []
            for i in range(0, len(hashes), 2):
                if i + 1 < len(hashes):
                    combined = hashes[i] + hashes[i + 1]
                else:
                    # Odd number of nodes - duplicate the last one
                    combined = hashes[i] + hashes[i]
                next_level.append(hashlib.sha256(combined.encode('utf-8')).hexdigest())
            hashes = next_level
        
        return hashes[0]
    
    def _build_merkle_proof_path(
        self,
        leaf_hashes: List[str],
        target_index: int
    ) -> List[tuple[str, str]]:
        """
        Build the Merkle proof path for a specific leaf.
        
        Args:
            leaf_hashes: List of all leaf hashes
            target_index: Index of the target leaf
            
        Returns:
            List of (sibling_hash, position) tuples
        """
        proof_path = []
        hashes = leaf_hashes.copy()
        index = target_index
        
        while len(hashes) > 1:
            next_level = []
            next_index = index // 2
            
            for i in range(0, len(hashes), 2):
                if i + 1 < len(hashes):
                    left = hashes[i]
                    right = hashes[i + 1]
                    
                    # If this pair contains our target, record the sibling
                    if i == index:
                        proof_path.append((right, 'right'))
                    elif i + 1 == index:
                        proof_path.append((left, 'left'))
                    
                    combined = left + right
                else:
                    # Odd number - duplicate
                    combined = hashes[i] + hashes[i]
                    if i == index:
                        proof_path.append((hashes[i], 'right'))
                
                next_level.append(hashlib.sha256(combined.encode('utf-8')).hexdigest())
            
            hashes = next_level
            index = next_index
        
        return proof_path


def verify_audit_export(export: AuditExport) -> AuditChainVerificationResult:
    """
    Verify an exported audit trail's integrity.
    
    This function can be used to verify exports without access to the
    original audit store.
    
    Args:
        export: The audit export to verify
        
    Returns:
        Verification result
        
    Validates: Requirements 36.3, 36.4
    """
    if not export.entries:
        return AuditChainVerificationResult(
            is_valid=True,
            total_entries=0,
            verified_entries=0,
            merkle_root=export.merkle_root
        )
    
    # Verify hash chain
    verified_count = 0
    expected_previous_hash = export.entries[0].previous_hash
    
    for i, entry in enumerate(export.entries):
        # Verify previous hash chain (except for first entry which we trust)
        if i > 0 and entry.previous_hash != expected_previous_hash:
            return AuditChainVerificationResult(
                is_valid=False,
                total_entries=len(export.entries),
                verified_entries=verified_count,
                first_invalid_sequence=entry.sequence_number,
                error_message=f"Chain broken at sequence {entry.sequence_number}"
            )
        
        # Verify entry's own hash
        if not entry.verify_hash():
            return AuditChainVerificationResult(
                is_valid=False,
                total_entries=len(export.entries),
                verified_entries=verified_count,
                first_invalid_sequence=entry.sequence_number,
                error_message=f"Hash verification failed at sequence {entry.sequence_number}"
            )
        
        expected_previous_hash = entry.entry_hash
        verified_count += 1
    
    # Verify Merkle root
    leaf_hashes = [e.entry_hash for e in export.entries]
    computed_root = _compute_merkle_root_from_hashes(leaf_hashes)
    
    if computed_root != export.merkle_root:
        return AuditChainVerificationResult(
            is_valid=False,
            total_entries=len(export.entries),
            verified_entries=verified_count,
            error_message="Merkle root mismatch"
        )
    
    return AuditChainVerificationResult(
        is_valid=True,
        total_entries=len(export.entries),
        verified_entries=verified_count,
        merkle_root=export.merkle_root
    )


def _compute_merkle_root_from_hashes(hashes: List[str]) -> str:
    """Compute Merkle root from a list of hashes."""
    if not hashes:
        return GENESIS_HASH
    
    current_level = hashes.copy()
    
    while len(current_level) > 1:
        next_level = []
        for i in range(0, len(current_level), 2):
            if i + 1 < len(current_level):
                combined = current_level[i] + current_level[i + 1]
            else:
                combined = current_level[i] + current_level[i]
            next_level.append(hashlib.sha256(combined.encode('utf-8')).hexdigest())
        current_level = next_level
    
    return current_level[0]
