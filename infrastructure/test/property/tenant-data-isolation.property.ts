import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateTenantPartitionKey,
  createTenantPartitionKey,
  extractTenantIdFromPartitionKey,
  createSortKey,
  ENTITY_TYPES,
} from '../../lib/stacks/dynamodb-stack.js';

/**
 * **Feature: private-aws-deployment, Property 5: Tenant Data Isolation**
 * 
 * For any DynamoDB write operation, the partition key SHALL include the tenant_id
 * to ensure data isolation.
 * 
 * **Validates: Requirements 4.2, 4.3**
 */
describe('Property 5: Tenant Data Isolation', () => {
  // Arbitrary for generating valid tenant IDs (non-empty alphanumeric strings)
  const validTenantId = fc.string({ minLength: 1, maxLength: 36 })
    .filter(s => s.trim().length > 0 && !s.includes('#'));

  // Arbitrary for generating valid entity IDs
  const validEntityId = fc.string({ minLength: 1, maxLength: 36 })
    .filter(s => s.trim().length > 0 && !s.includes('#'));

  // Arbitrary for generating entity types
  const entityType = fc.constantFrom(
    ENTITY_TYPES.METADATA,
    ENTITY_TYPES.USER,
    ENTITY_TYPES.WORKFLOW,
    ENTITY_TYPES.CDE,
    ENTITY_TYPES.ISSUE,
    ENTITY_TYPES.AUDIT
  );

  /**
   * Property: All valid partition keys must start with TENANT# prefix
   * 
   * This ensures that every partition key includes the tenant identifier,
   * which is essential for tenant data isolation.
   */
  it('should validate partition keys that start with TENANT# prefix', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given a valid tenant ID
        // When we create a partition key
        const partitionKey = createTenantPartitionKey(tenantId);
        
        // Then the partition key should be valid
        expect(validateTenantPartitionKey(partitionKey)).toBe(true);
        
        // And it should start with TENANT#
        expect(partitionKey.startsWith('TENANT#')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Partition key creation and extraction are inverse operations
   * 
   * This is a round-trip property that ensures we can always extract
   * the tenant ID from a partition key that was created with that tenant ID.
   */
  it('should extract tenant ID from partition key (round-trip)', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given a valid tenant ID
        // When we create a partition key and extract the tenant ID
        const partitionKey = createTenantPartitionKey(tenantId);
        const extractedTenantId = extractTenantIdFromPartitionKey(partitionKey);
        
        // Then the extracted tenant ID should match the original
        expect(extractedTenantId).toBe(tenantId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid partition keys should fail validation
   * 
   * Partition keys that don't follow the TENANT# pattern should be rejected.
   */
  it('should reject partition keys without TENANT# prefix', () => {
    // Generate strings that don't start with TENANT#
    const invalidPrefix = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => !s.startsWith('TENANT#') && s.trim().length > 0);

    fc.assert(
      fc.property(invalidPrefix, (invalidKey) => {
        // Given a string that doesn't start with TENANT#
        // When we validate it as a partition key
        const isValid = validateTenantPartitionKey(invalidKey);
        
        // Then validation should fail
        expect(isValid).toBe(false);
        
        // And extraction should return null
        expect(extractTenantIdFromPartitionKey(invalidKey)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty or null partition keys should fail validation
   */
  it('should reject empty or null partition keys', () => {
    const emptyValues = fc.constantFrom('', null, undefined);

    fc.assert(
      fc.property(emptyValues, (emptyValue) => {
        // Given an empty or null value
        // When we validate it as a partition key
        const isValid = validateTenantPartitionKey(emptyValue as string);
        
        // Then validation should fail
        expect(isValid).toBe(false);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: TENANT# prefix alone (without tenant ID) should fail validation
   */
  it('should reject TENANT# prefix without tenant ID', () => {
    // Given just the TENANT# prefix
    const partitionKey = 'TENANT#';
    
    // When we validate it
    const isValid = validateTenantPartitionKey(partitionKey);
    
    // Then validation should fail
    expect(isValid).toBe(false);
  });

  /**
   * Property: Creating partition key with empty tenant ID should throw
   */
  it('should throw when creating partition key with empty tenant ID', () => {
    const emptyValues = fc.constantFrom('', '   ', null, undefined);

    fc.assert(
      fc.property(emptyValues, (emptyValue) => {
        // Given an empty tenant ID
        // When we try to create a partition key
        // Then it should throw an error
        expect(() => createTenantPartitionKey(emptyValue as string)).toThrow();
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Sort keys should follow entity type pattern
   */
  it('should create sort keys with entity type prefix', () => {
    fc.assert(
      fc.property(entityType, validEntityId, (type, entityId) => {
        // Given an entity type and ID
        // When we create a sort key
        const sortKey = createSortKey(type, entityId);
        
        // Then the sort key should contain the entity type
        expect(sortKey.startsWith(type.toUpperCase())).toBe(true);
        
        // And it should contain the entity ID
        expect(sortKey.includes(entityId)).toBe(true);
        
        // And it should follow the pattern TYPE#ID
        expect(sortKey).toBe(`${type.toUpperCase()}#${entityId}`);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Different tenant IDs produce different partition keys
   * 
   * This ensures that data from different tenants cannot accidentally
   * be stored under the same partition key.
   */
  it('should produce unique partition keys for different tenant IDs', () => {
    fc.assert(
      fc.property(validTenantId, validTenantId, (tenantId1, tenantId2) => {
        // Skip if tenant IDs are the same
        fc.pre(tenantId1 !== tenantId2);
        
        // Given two different tenant IDs
        // When we create partition keys for each
        const pk1 = createTenantPartitionKey(tenantId1);
        const pk2 = createTenantPartitionKey(tenantId2);
        
        // Then the partition keys should be different
        expect(pk1).not.toBe(pk2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Partition key format is deterministic
   * 
   * Creating a partition key with the same tenant ID should always
   * produce the same result.
   */
  it('should produce deterministic partition keys', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given a tenant ID
        // When we create partition keys multiple times
        const pk1 = createTenantPartitionKey(tenantId);
        const pk2 = createTenantPartitionKey(tenantId);
        const pk3 = createTenantPartitionKey(tenantId);
        
        // Then all partition keys should be identical
        expect(pk1).toBe(pk2);
        expect(pk2).toBe(pk3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Tenant ID extraction is deterministic
   */
  it('should extract tenant ID deterministically', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given a partition key
        const partitionKey = createTenantPartitionKey(tenantId);
        
        // When we extract the tenant ID multiple times
        const extracted1 = extractTenantIdFromPartitionKey(partitionKey);
        const extracted2 = extractTenantIdFromPartitionKey(partitionKey);
        
        // Then all extractions should be identical
        expect(extracted1).toBe(extracted2);
        expect(extracted1).toBe(tenantId);
      }),
      { numRuns: 100 }
    );
  });
});
