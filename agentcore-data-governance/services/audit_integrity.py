"""
Audit trail integrity verification service.

This module provides APIs for verifying the integrity of immutable audit trails
and generating Merkle tree proofs for exports.

Requirements: 36.3, 36.4
"""

from datetime import datetime
from typing import Optional, List, Tuple
import hashlib

from models.audit import (
    ImmutableAuditEntry,
    MerkleProof,
    AuditChainVerificationResult,
    AuditExport,
)
from repository.immutable_audit import (
    ImmutableAuditStore,
    verify_audit_export,
    GENESIS_HASH,
)


class AuditIntegrityService:
    """
    Service for verifying audit trail integrity and generating proofs.
    
    Provides:
    - Hash chain verification API
    - Merkle tree proof generation for exports
    - Tamper detection
    
    Validates: Requirements 36.3, 36.4
    """
    
    def __init__(self, audit_store: ImmutableAuditStore):
        """
        Initialize the integrity service.
        
        Args:
            audit_store: The immutable audit store to verify
        """
        self._store = audit_store
    
    def verify_full_chain(self) -> AuditChainVerificationResult:
        """
        Verify the integrity of the entire audit chain.
        
        Checks that:
        1. Each entry's hash matches its content
        2. Each entry's previous_hash matches the previous entry's hash
        3. The chain is unbroken from genesis to the latest entry
        
        Returns:
            Verification result with details
            
        Validates: Requirements 36.3
        """
        return self._store.verify_chain()
    
    def verify_range(
        self,
        start_sequence: int,
        end_sequence: int
    ) -> AuditChainVerificationResult:
        """
        Verify a specific range of the audit chain.
        
        Args:
            start_sequence: Starting sequence number
            end_sequence: Ending sequence number
            
        Returns:
            Verification result for the specified range
            
        Validates: Requirements 36.3
        """
        return self._store.verify_chain(start_sequence, end_sequence)
    
    def verify_entry(self, entry_id: str) -> Tuple[bool, Optional[str]]:
        """
        Verify a single entry's integrity.
        
        Args:
            entry_id: The ID of the entry to verify
            
        Returns:
            Tuple of (is_valid, error_message)
            
        Validates: Requirements 36.3
        """
        entry = self._store.get_entry_by_id(entry_id)
        if entry is None:
            return False, f"Entry not found: {entry_id}"
        
        if not entry.verify_hash():
            return False, f"Hash verification failed for entry {entry_id}"
        
        # Verify chain linkage
        if entry.sequence_number > 0:
            prev_entry = self._store.get_entry(entry.sequence_number - 1)
            if prev_entry and entry.previous_hash != prev_entry.entry_hash:
                return False, f"Chain linkage broken at entry {entry_id}"
        elif entry.previous_hash != GENESIS_HASH:
            return False, f"Genesis entry has invalid previous_hash"
        
        return True, None
    
    def generate_inclusion_proof(self, entry_id: str) -> Optional[MerkleProof]:
        """
        Generate a Merkle proof for an entry's inclusion in the audit trail.
        
        The proof allows verification that an entry is included in the
        audit trail without needing the entire chain.
        
        Args:
            entry_id: The ID of the entry to generate proof for
            
        Returns:
            MerkleProof if entry found, None otherwise
            
        Validates: Requirements 36.4
        """
        return self._store.generate_merkle_proof(entry_id)
    
    def verify_inclusion_proof(self, proof: MerkleProof) -> bool:
        """
        Verify a Merkle inclusion proof.
        
        Args:
            proof: The Merkle proof to verify
            
        Returns:
            True if the proof is valid, False otherwise
            
        Validates: Requirements 36.4
        """
        return proof.verify()
    
    def export_with_integrity_proofs(
        self,
        start_sequence: Optional[int] = None,
        end_sequence: Optional[int] = None
    ) -> AuditExport:
        """
        Export audit entries with Merkle tree integrity proofs.
        
        The export includes:
        - All entries in the specified range
        - Merkle root for the exported entries
        - Metadata for verification
        
        Args:
            start_sequence: Starting sequence number (default: 0)
            end_sequence: Ending sequence number (default: last entry)
            
        Returns:
            AuditExport with entries and Merkle root
            
        Validates: Requirements 36.4
        """
        return self._store.export_with_proofs(start_sequence, end_sequence)
    
    def get_merkle_root(self) -> str:
        """
        Get the current Merkle root of the entire audit chain.
        
        Returns:
            The Merkle root hash
            
        Validates: Requirements 36.4
        """
        if self._store.entry_count == 0:
            return GENESIS_HASH
        
        result = self._store.verify_chain()
        return result.merkle_root or GENESIS_HASH
    
    def detect_tampering(self) -> List[int]:
        """
        Detect any tampered entries in the audit chain.
        
        Returns:
            List of sequence numbers where tampering was detected
            
        Validates: Requirements 36.3
        """
        tampered = []
        
        for i in range(self._store.entry_count):
            entry = self._store.get_entry(i)
            if entry is None:
                continue
            
            # Check hash integrity
            if not entry.verify_hash():
                tampered.append(i)
                continue
            
            # Check chain linkage
            if i == 0:
                if entry.previous_hash != GENESIS_HASH:
                    tampered.append(i)
            else:
                prev_entry = self._store.get_entry(i - 1)
                if prev_entry and entry.previous_hash != prev_entry.entry_hash:
                    tampered.append(i)
        
        return tampered


def verify_exported_audit_trail(export: AuditExport) -> AuditChainVerificationResult:
    """
    Verify an exported audit trail's integrity.
    
    This function can be used to verify exports without access to the
    original audit store. Useful for:
    - Regulatory auditors verifying exported records
    - Cross-system verification
    - Archival integrity checks
    
    Args:
        export: The audit export to verify
        
    Returns:
        Verification result
        
    Validates: Requirements 36.3, 36.4
    """
    return verify_audit_export(export)


def compute_merkle_root(entries: List[ImmutableAuditEntry]) -> str:
    """
    Compute the Merkle root for a list of audit entries.
    
    Args:
        entries: List of immutable audit entries
        
    Returns:
        The computed Merkle root hash
        
    Validates: Requirements 36.4
    """
    if not entries:
        return GENESIS_HASH
    
    hashes = [e.entry_hash for e in entries]
    
    while len(hashes) > 1:
        next_level = []
        for i in range(0, len(hashes), 2):
            if i + 1 < len(hashes):
                combined = hashes[i] + hashes[i + 1]
            else:
                combined = hashes[i] + hashes[i]
            next_level.append(hashlib.sha256(combined.encode('utf-8')).hexdigest())
        hashes = next_level
    
    return hashes[0]


def verify_merkle_proof(
    entry_hash: str,
    proof_path: List[Tuple[str, str]],
    expected_root: str
) -> bool:
    """
    Verify a Merkle proof independently.
    
    Args:
        entry_hash: The hash of the entry being verified
        proof_path: List of (sibling_hash, position) tuples
        expected_root: The expected Merkle root
        
    Returns:
        True if the proof is valid, False otherwise
        
    Validates: Requirements 36.4
    """
    current_hash = entry_hash
    
    for sibling_hash, position in proof_path:
        if position == 'left':
            combined = sibling_hash + current_hash
        else:
            combined = current_hash + sibling_hash
        current_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()
    
    return current_hash == expected_root
