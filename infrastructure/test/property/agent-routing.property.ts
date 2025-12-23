import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AGENT_TYPES,
  AgentType,
  AgentArns,
  isValidAgentType,
  getAgentArn,
  parseAgentArn,
} from '../../lib/lambda/agent-proxy/handler.js';

/**
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 *
 * For any API request to /api/agents/{agentType}, the request SHALL be routed
 * to the AgentCore agent ARN corresponding to that agent type.
 *
 * **Validates: Requirements 2.2, 5.2**
 */
describe('Property 1: Agent Routing Correctness', () => {
  // Arbitrary for generating valid agent types
  const validAgentType = fc.constantFrom(...AGENT_TYPES);

  // Arbitrary for generating invalid agent types
  const invalidAgentType = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => !AGENT_TYPES.includes(s as AgentType));

  // Arbitrary for generating valid agent ARNs
  const validAgentArn = fc.record({
    region: fc.constantFrom('us-west-2', 'us-east-1', 'eu-west-1'),
    account: fc.stringMatching(/^[0-9]{12}$/),
    agentName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
    agentId: fc.string({ minLength: 8, maxLength: 12 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  }).map(({ region, account, agentName, agentId }) =>
    `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentName}-${agentId}`
  );

  // Arbitrary for generating complete agent ARN mappings
  const validAgentArnsMapping = fc.record({
    regulatory: validAgentArn,
    dataRequirements: validAgentArn,
    cdeIdentification: validAgentArn,
    dataQuality: validAgentArn,
    lineageMapping: validAgentArn,
    issueManagement: validAgentArn,
    documentation: validAgentArn,
    orchestrator: validAgentArn,
  }) as fc.Arbitrary<AgentArns>;

  /**
   * Property: Valid agent types should be recognized
   */
  it('should recognize all valid agent types', () => {
    fc.assert(
      fc.property(validAgentType, (agentType) => {
        // Given a valid agent type
        // When we validate it
        const result = isValidAgentType(agentType);

        // Then it should be recognized as valid
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid agent types should be rejected
   */
  it('should reject invalid agent types', () => {
    fc.assert(
      fc.property(invalidAgentType, (agentType) => {
        // Given an invalid agent type
        // When we validate it
        const result = isValidAgentType(agentType);

        // Then it should be rejected
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Agent type validation is deterministic
   */
  it('should return consistent results for the same agent type', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50 }), (agentType) => {
        // Given any string
        // When we validate it multiple times
        const result1 = isValidAgentType(agentType);
        const result2 = isValidAgentType(agentType);
        const result3 = isValidAgentType(agentType);

        // Then all results should be identical
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property: Valid agent type with configured ARN should return the correct ARN
   */
  it('should return correct ARN for valid agent type with configured ARN', () => {
    fc.assert(
      fc.property(
        validAgentType,
        validAgentArnsMapping,
        (agentType, agentArns) => {
          // Given a valid agent type and configured ARNs
          // When we get the agent ARN
          const result = getAgentArn(agentType, agentArns);

          // Then it should return the ARN for that specific agent type
          expect(result).toBe(agentArns[agentType]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Agent type with empty ARN should throw NotFoundError
   */
  it('should throw error for agent type with empty ARN', () => {
    fc.assert(
      fc.property(validAgentType, (agentType) => {
        // Given an agent type with empty ARN
        const emptyArns: AgentArns = {
          regulatory: '',
          dataRequirements: '',
          cdeIdentification: '',
          dataQuality: '',
          lineageMapping: '',
          issueManagement: '',
          documentation: '',
          orchestrator: '',
        };

        // When we try to get the agent ARN
        // Then it should throw an error
        expect(() => getAgentArn(agentType, emptyArns)).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Agent routing is consistent - same type always routes to same ARN
   */
  it('should consistently route same agent type to same ARN', () => {
    fc.assert(
      fc.property(
        validAgentType,
        validAgentArnsMapping,
        (agentType, agentArns) => {
          // Given a valid agent type and configured ARNs
          // When we get the ARN multiple times
          const result1 = getAgentArn(agentType, agentArns);
          const result2 = getAgentArn(agentType, agentArns);
          const result3 = getAgentArn(agentType, agentArns);

          // Then all results should be identical
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Different agent types route to different ARNs (when ARNs are unique)
   */
  it('should route different agent types to different ARNs when ARNs are unique', () => {
    fc.assert(
      fc.property(
        fc.tuple(validAgentType, validAgentType).filter(([a, b]) => a !== b),
        validAgentArnsMapping,
        ([agentType1, agentType2], agentArns) => {
          // Given two different agent types with unique ARNs
          // When we get their ARNs
          const arn1 = getAgentArn(agentType1, agentArns);
          const arn2 = getAgentArn(agentType2, agentArns);

          // Then the ARNs should be different (since we generated unique ARNs)
          // Note: This property holds because our generator creates unique ARNs
          expect(arn1).not.toBe(arn2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Tests for ARN parsing
 */
describe('Agent ARN Parsing', () => {
  // Arbitrary for generating valid agent ARN components
  const validArnComponents = fc.record({
    region: fc.constantFrom('us-west-2', 'us-east-1', 'eu-west-1'),
    account: fc.stringMatching(/^[0-9]{12}$/),
    agentName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
    agentId: fc.string({ minLength: 8, maxLength: 12 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  });

  /**
   * Property: Valid ARN should be parsed successfully
   */
  it('should parse valid agent ARN', () => {
    fc.assert(
      fc.property(validArnComponents, ({ region, account, agentName, agentId }) => {
        // Given a valid agent ARN
        const arn = `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentName}-${agentId}`;

        // When we parse it
        const result = parseAgentArn(arn);

        // Then it should extract the agent ID
        expect(result.agentId).toBe(agentId);
        expect(result.agentAliasId).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid ARN format should throw ValidationError
   */
  it('should throw error for invalid ARN format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('runtime/')),
        (invalidArn) => {
          // Given an invalid ARN (missing runtime/)
          // When we try to parse it
          // Then it should throw an error
          expect(() => parseAgentArn(invalidArn)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: ARN parsing is deterministic
   */
  it('should return consistent results for the same ARN', () => {
    fc.assert(
      fc.property(validArnComponents, ({ region, account, agentName, agentId }) => {
        // Given a valid agent ARN
        const arn = `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentName}-${agentId}`;

        // When we parse it multiple times
        const result1 = parseAgentArn(arn);
        const result2 = parseAgentArn(arn);
        const result3 = parseAgentArn(arn);

        // Then all results should be identical
        expect(result1.agentId).toBe(result2.agentId);
        expect(result2.agentId).toBe(result3.agentId);
        expect(result1.agentAliasId).toBe(result2.agentAliasId);
        expect(result2.agentAliasId).toBe(result3.agentAliasId);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Tests for complete agent routing flow
 */
describe('Complete Agent Routing Flow', () => {
  const validAgentType = fc.constantFrom(...AGENT_TYPES);
  
  const validAgentArn = fc.record({
    region: fc.constantFrom('us-west-2', 'us-east-1', 'eu-west-1'),
    account: fc.stringMatching(/^[0-9]{12}$/),
    agentName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
    agentId: fc.string({ minLength: 8, maxLength: 12 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  }).map(({ region, account, agentName, agentId }) =>
    `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentName}-${agentId}`
  );

  const validAgentArnsMapping = fc.record({
    regulatory: validAgentArn,
    dataRequirements: validAgentArn,
    cdeIdentification: validAgentArn,
    dataQuality: validAgentArn,
    lineageMapping: validAgentArn,
    issueManagement: validAgentArn,
    documentation: validAgentArn,
    orchestrator: validAgentArn,
  }) as fc.Arbitrary<AgentArns>;

  /**
   * Property: Complete routing flow - validate, get ARN, parse ARN
   */
  it('should complete full routing flow for valid agent types', () => {
    fc.assert(
      fc.property(
        validAgentType,
        validAgentArnsMapping,
        (agentType, agentArns) => {
          // Given a valid agent type and configured ARNs
          // Step 1: Validate agent type
          expect(isValidAgentType(agentType)).toBe(true);

          // Step 2: Get agent ARN
          const arn = getAgentArn(agentType, agentArns);
          expect(arn).toBe(agentArns[agentType]);

          // Step 3: Parse ARN to get agent ID
          const { agentId, agentAliasId } = parseAgentArn(arn);
          expect(agentId).toBeDefined();
          expect(agentId.length).toBeGreaterThan(0);
          expect(agentAliasId).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
