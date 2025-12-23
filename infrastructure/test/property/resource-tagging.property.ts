import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  validateRequiredTags, 
  ResourceTags 
} from '../../lib/config/environment.js';
import { 
  hasRequiredTags, 
  getRequiredTagNames 
} from '../../lib/constructs/resource-tagging.js';

/**
 * **Feature: private-aws-deployment, Property 8: Resource Tagging Completeness**
 * 
 * For any AWS resource created by the CDK stack, the resource SHALL have 
 * environment, project, and cost-center tags.
 * 
 * **Validates: Requirements 8.3, 15.2**
 */
describe('Property 8: Resource Tagging Completeness', () => {
  // Arbitrary for generating valid tag values (non-empty strings)
  const validTagValue = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating valid ResourceTags
  const validResourceTags = fc.record({
    Environment: validTagValue,
    Project: validTagValue,
    CostCenter: validTagValue,
  }) as fc.Arbitrary<ResourceTags>;

  // Arbitrary for generating additional optional tags
  const optionalTags = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => 
      !['Environment', 'Project', 'CostCenter'].includes(s) && 
      s.trim().length > 0
    ),
    validTagValue
  );

  // Arbitrary for generating ResourceTags with optional additional tags
  const resourceTagsWithOptional = fc.tuple(validResourceTags, optionalTags)
    .map(([required, optional]) => ({ ...required, ...optional } as ResourceTags));

  /**
   * Property: All valid tag sets must contain Environment, Project, and CostCenter
   */
  it('should validate that all required tags are present', () => {
    fc.assert(
      fc.property(validResourceTags, (tags) => {
        // Given a valid set of tags with all required fields
        // When we validate the tags
        const isValid = validateRequiredTags(tags);
        
        // Then validation should pass
        expect(isValid).toBe(true);
        
        // And hasRequiredTags should also return true
        expect(hasRequiredTags(tags)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Tags with additional optional tags should still be valid
   */
  it('should accept tags with additional optional tags', () => {
    fc.assert(
      fc.property(resourceTagsWithOptional, (tags) => {
        // Given tags with required fields plus optional additional tags
        // When we validate the tags
        const isValid = validateRequiredTags(tags);
        
        // Then validation should pass
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing any required tag should fail validation
   */
  it('should reject tags missing any required tag', () => {
    const requiredTagNames = getRequiredTagNames();
    
    fc.assert(
      fc.property(
        validResourceTags,
        fc.constantFrom(...requiredTagNames),
        (tags, tagToRemove) => {
          // Given a valid set of tags
          // When we remove one required tag
          const incompleteTags = { ...tags };
          delete (incompleteTags as Record<string, string>)[tagToRemove];
          
          // Then validation should fail
          const isValid = validateRequiredTags(incompleteTags as ResourceTags);
          expect(isValid).toBe(false);
          
          // And hasRequiredTags should also return false
          expect(hasRequiredTags(incompleteTags)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty string values for required tags should fail validation
   */
  it('should reject tags with empty string values', () => {
    const requiredTagNames = getRequiredTagNames();
    
    fc.assert(
      fc.property(
        validResourceTags,
        fc.constantFrom(...requiredTagNames),
        (tags, tagToEmpty) => {
          // Given a valid set of tags
          // When we set one required tag to empty string
          const tagsWithEmpty = { ...tags, [tagToEmpty]: '' };
          
          // Then validation should fail
          const isValid = validateRequiredTags(tagsWithEmpty as ResourceTags);
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The required tag names should be consistent
   */
  it('should have consistent required tag names', () => {
    const requiredTags = getRequiredTagNames();
    
    // Required tags should always include these three
    expect(requiredTags).toContain('Environment');
    expect(requiredTags).toContain('Project');
    expect(requiredTags).toContain('CostCenter');
    expect(requiredTags).toHaveLength(3);
  });

  /**
   * Property: Validation functions should be consistent with each other
   */
  it('should have consistent validation between validateRequiredTags and hasRequiredTags', () => {
    // Generate both valid and potentially invalid tag sets
    const anyTags = fc.oneof(
      validResourceTags,
      fc.record({
        Environment: fc.oneof(validTagValue, fc.constant('')),
        Project: fc.oneof(validTagValue, fc.constant('')),
        CostCenter: fc.oneof(validTagValue, fc.constant('')),
      })
    );

    fc.assert(
      fc.property(anyTags, (tags) => {
        // Given any set of tags
        // When we validate with both functions
        const result1 = validateRequiredTags(tags as ResourceTags);
        const result2 = hasRequiredTags(tags as Record<string, string>);
        
        // Then both functions should return the same result
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 }
    );
  });
});
