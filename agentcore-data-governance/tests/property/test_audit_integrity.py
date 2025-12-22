"""
**Feature: agentcore-python-refactor, Property 26: Audit Trail Integrity Verification**

For any sequence of audit entries appended to the immutable audit store,
the hash chain verification SHALL detect any tampering with entry content
or chain linkage.

**Validates: Requirements 36.1, 36.3**
"""

import pytest
from datetime import datetime
from copy import deepcopy
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.audit import (
    AuditEntry,
    ImmutableAuditEntry,
)
from repository.immutable_audit import (
    ImmutableAuditStore,
    GENESIS_HASH,
    verify_audit_export,
)
from services.audit_integrity import (
    AuditIntegrityService,
    compute_merkle_root,
    verify_merkle_proof,
)
from tests.strategies.audit_strategies import (
    audit_entry_strategy,
    audit_trail_strategy,
)


class TestAuditTrailIntegrityVerification:
    """
    Property 26: Audit Trail Integrity Verification
    
    Tests that the hash-chained audit trail correctly detects tampering.
    """
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=20))
    def test_valid_chain_passes_verification(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: For any sequence of audit entries, appending them to the
        immutable store and verifying the chain SHALL return is_valid=True.
        """
        store = ImmutableAuditStore()
        
        # Append all entries to the store
        for entry in entries:
            store.append(entry)
        
        # Verify the chain
        result = store.verify_chain()
        
        assert result.is_valid, \
            f"Valid chain should pass verification. Error: {result.error_message}"
        assert result.verified_entries == len(entries), \
            f"Expected {len(entries)} verified entries, got {result.verified_entries}"
        assert result.total_entries == len(entries), \
            f"Expected {len(entries)} total entries, got {result.total_entries}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=2, max_entries=10))
    def test_tampered_content_detected(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: If any entry's content is modified after appending,
        the hash verification SHALL detect the tampering.
        """
        store = ImmutableAuditStore()
        
        # Append all entries
        for entry in entries:
            store.append(entry)
        
        # Pick a random entry to tamper with
        tamper_index = len(entries) // 2
        
        # Access internal storage to simulate tampering
        # (In production, this would be prevented by append-only storage)
        original_entry = store._entries[tamper_index]
        
        # Tamper with the action field
        tampered_entry = ImmutableAuditEntry(
            id=original_entry.id,
            sequence_number=original_entry.sequence_number,
            tenant_id=original_entry.tenant_id,
            timestamp=original_entry.timestamp,
            actor=original_entry.actor,
            actor_type=original_entry.actor_type,
            action="TAMPERED_ACTION",  # Modified!
            entity_type=original_entry.entity_type,
            entity_id=original_entry.entity_id,
            previous_state=original_entry.previous_state,
            new_state=original_entry.new_state,
            rationale=original_entry.rationale,
            previous_hash=original_entry.previous_hash,
            entry_hash=original_entry.entry_hash,  # Hash no longer matches content
        )
        store._entries[tamper_index] = tampered_entry
        
        # Verify the chain - should detect tampering
        result = store.verify_chain()
        
        assert not result.is_valid, \
            "Tampered content should be detected by hash verification"
        assert result.first_invalid_sequence == tamper_index, \
            f"Expected tampering detected at index {tamper_index}, got {result.first_invalid_sequence}"
        assert "tampered" in result.error_message.lower() or "hash" in result.error_message.lower(), \
            f"Error message should indicate hash/tampering issue: {result.error_message}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=3, max_entries=10))
    def test_broken_chain_linkage_detected(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: If the previous_hash linkage is broken (entry points to
        wrong previous hash), verification SHALL detect the break.
        """
        store = ImmutableAuditStore()
        
        # Append all entries
        for entry in entries:
            store.append(entry)
        
        # Pick an entry to break the chain (not the first one)
        break_index = len(entries) // 2 + 1
        assume(break_index > 0 and break_index < len(entries))
        
        original_entry = store._entries[break_index]
        
        # Create a new entry with wrong previous_hash but recomputed entry_hash
        wrong_previous_hash = "0" * 64  # Wrong hash
        
        # Recompute entry_hash with the wrong previous_hash
        new_entry_hash = ImmutableAuditEntry.compute_hash(
            sequence_number=original_entry.sequence_number,
            tenant_id=original_entry.tenant_id,
            timestamp=original_entry.timestamp,
            actor=original_entry.actor,
            actor_type=original_entry.actor_type,
            action=original_entry.action,
            entity_type=original_entry.entity_type,
            entity_id=original_entry.entity_id,
            previous_state=original_entry.previous_state,
            new_state=original_entry.new_state,
            rationale=original_entry.rationale,
            previous_hash=wrong_previous_hash,
        )
        
        broken_entry = ImmutableAuditEntry(
            id=original_entry.id,
            sequence_number=original_entry.sequence_number,
            tenant_id=original_entry.tenant_id,
            timestamp=original_entry.timestamp,
            actor=original_entry.actor,
            actor_type=original_entry.actor_type,
            action=original_entry.action,
            entity_type=original_entry.entity_type,
            entity_id=original_entry.entity_id,
            previous_state=original_entry.previous_state,
            new_state=original_entry.new_state,
            rationale=original_entry.rationale,
            previous_hash=wrong_previous_hash,  # Wrong linkage!
            entry_hash=new_entry_hash,  # Valid hash for this content
        )
        store._entries[break_index] = broken_entry
        
        # Verify the chain - should detect broken linkage
        result = store.verify_chain()
        
        assert not result.is_valid, \
            "Broken chain linkage should be detected"
        assert result.first_invalid_sequence == break_index, \
            f"Expected break detected at index {break_index}, got {result.first_invalid_sequence}"
        assert "chain" in result.error_message.lower() or "previous" in result.error_message.lower(), \
            f"Error message should indicate chain break: {result.error_message}"
    
    @settings(max_examples=100)
    @given(entry=audit_entry_strategy())
    def test_hash_is_deterministic(self, entry: AuditEntry):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: Computing the hash of the same entry content multiple times
        SHALL produce the same hash value.
        """
        previous_hash = GENESIS_HASH
        sequence_number = 0
        
        # Compute hash multiple times
        hash1 = ImmutableAuditEntry.compute_hash(
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
        )
        
        hash2 = ImmutableAuditEntry.compute_hash(
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
        )
        
        assert hash1 == hash2, \
            f"Hash should be deterministic. Got {hash1} and {hash2}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=10))
    def test_first_entry_links_to_genesis(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: The first entry in the chain SHALL have previous_hash
        equal to the genesis hash.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Get the first entry
        first_entry = store.get_entry(0)
        
        assert first_entry is not None, "First entry should exist"
        assert first_entry.previous_hash == GENESIS_HASH, \
            f"First entry should link to genesis hash. Got {first_entry.previous_hash}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=2, max_entries=10))
    def test_each_entry_links_to_previous(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: Each entry (except the first) SHALL have previous_hash
        equal to the entry_hash of the preceding entry.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Verify chain linkage
        for i in range(1, len(entries)):
            current = store.get_entry(i)
            previous = store.get_entry(i - 1)
            
            assert current.previous_hash == previous.entry_hash, \
                f"Entry {i} should link to entry {i-1}. " \
                f"Expected {previous.entry_hash}, got {current.previous_hash}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=10))
    def test_verify_hash_returns_true_for_valid_entries(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: For any valid immutable entry, verify_hash() SHALL return True.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Verify each entry's hash
        for i in range(len(entries)):
            immutable_entry = store.get_entry(i)
            assert immutable_entry.verify_hash(), \
                f"Entry {i} should have valid hash"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=10))
    def test_integrity_service_full_chain_verification(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: The AuditIntegrityService SHALL correctly verify a valid chain.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Use integrity service
        service = AuditIntegrityService(store)
        result = service.verify_full_chain()
        
        assert result.is_valid, \
            f"Integrity service should verify valid chain. Error: {result.error_message}"
        assert result.verified_entries == len(entries), \
            f"Expected {len(entries)} verified entries"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=2, max_entries=10))
    def test_integrity_service_detects_tampering(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: The AuditIntegrityService SHALL detect tampered entries.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Tamper with an entry
        tamper_index = len(entries) // 2
        original = store._entries[tamper_index]
        
        tampered = ImmutableAuditEntry(
            id=original.id,
            sequence_number=original.sequence_number,
            tenant_id=original.tenant_id,
            timestamp=original.timestamp,
            actor="TAMPERED_ACTOR",  # Modified!
            actor_type=original.actor_type,
            action=original.action,
            entity_type=original.entity_type,
            entity_id=original.entity_id,
            previous_state=original.previous_state,
            new_state=original.new_state,
            rationale=original.rationale,
            previous_hash=original.previous_hash,
            entry_hash=original.entry_hash,
        )
        store._entries[tamper_index] = tampered
        
        # Use integrity service
        service = AuditIntegrityService(store)
        result = service.verify_full_chain()
        
        assert not result.is_valid, \
            "Integrity service should detect tampering"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=10))
    def test_export_and_verify_round_trip(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: Exporting an audit trail and verifying the export SHALL
        succeed for a valid chain.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Export
        export = store.export_with_proofs()
        
        # Verify export
        result = verify_audit_export(export)
        
        assert result.is_valid, \
            f"Export verification should succeed. Error: {result.error_message}"
        assert result.verified_entries == len(entries), \
            f"Expected {len(entries)} verified entries in export"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=3, max_entries=10))
    def test_merkle_root_consistency(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: The Merkle root computed from the same entries SHALL
        always be the same.
        """
        store = ImmutableAuditStore()
        
        # Append entries
        for entry in entries:
            store.append(entry)
        
        # Get Merkle root via verification
        result1 = store.verify_chain()
        result2 = store.verify_chain()
        
        assert result1.merkle_root == result2.merkle_root, \
            f"Merkle root should be consistent. Got {result1.merkle_root} and {result2.merkle_root}"
    
    @settings(max_examples=100)
    @given(entries=audit_trail_strategy(min_entries=1, max_entries=10))
    def test_empty_store_verification(self, entries: list[AuditEntry]):
        """
        **Validates: Requirements 36.1, 36.3**
        
        Property: An empty audit store SHALL pass verification.
        """
        store = ImmutableAuditStore()
        
        # Verify empty store
        result = store.verify_chain()
        
        assert result.is_valid, \
            "Empty store should pass verification"
        assert result.total_entries == 0, \
            "Empty store should have 0 entries"
        assert result.verified_entries == 0, \
            "Empty store should have 0 verified entries"
