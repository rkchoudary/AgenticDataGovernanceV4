import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  hasRoutePermission,
  ROLE_PERMISSIONS,
  AGENT_TYPES,
  isValidAgentType,
  getAgentArn,
  AgentType,
} from '../../lib/stacks/api-gateway-stack.js';

/**
 * **Feature: private-aws-deployment, Property 11: RBAC Enforcement**
 *
 * For any API request, the API Gateway authorizer SHALL enforce role-based
 * access control based on the JWT claims.
 *
 * **Validates: Requirements 14.4, 14.5**
 */
describe('Property 11: RBAC Enforcement', () => {
  // Valid roles in the system
  const validRoles = ['admin', 'compliance_officer', 'data_steward', 'viewer'] as const;

  // Arbitrary for generating valid roles
  const validRole = fc.constantFrom(...validRoles);

  // Arbitrary for generating HTTP methods
  const httpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');

  // Arbitrary for generating API routes
  const apiRoute = fc.oneof(
    fc.constant('/api/users'),
    fc.constant('/api/users/123'),
    fc.constant('/api/workflows'),
    fc.constant('/api/workflows/456'),
    fc.constant('/api/data/cdes'),
    fc.constant('/api/data/issues'),
    fc.constant('/api/data/audit'),
    fc.constant('/api/agents'),
    fc.constant('/api/agents/regulatory'),
    fc.constant('/api/agents/orchestrator'),
  );

  /**
   * Property: Admin role should have access to all routes and methods
   */
  it('should grant admin access to all routes and methods', () => {
    fc.assert(
      fc.property(apiRoute, httpMethod, (route, method) => {
        // Given an admin role
        // When checking permission for any route and method
        const hasPermission = hasRoutePermission('admin', route, method);

        // Then permission should be granted
        expect(hasPermission).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Viewer role should only have GET access
   */
  it('should restrict viewer to GET method only', () => {
    fc.assert(
      fc.property(
        apiRoute,
        fc.constantFrom('POST', 'PUT', 'DELETE'),
        (route, method) => {
          // Given a viewer role
          // When checking permission for non-GET methods
          const hasPermission = hasRoutePermission('viewer', route, method);

          // Then permission should be denied
          expect(hasPermission).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Viewer role should have GET access to allowed routes
   */
  it('should grant viewer GET access to workflows and data routes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/api/workflows',
          '/api/workflows/123',
          '/api/data/cdes',
          '/api/data/issues',
          '/api/data/audit'
        ),
        (route) => {
          // Given a viewer role
          // When checking GET permission for allowed routes
          const hasPermission = hasRoutePermission('viewer', route, 'GET');

          // Then permission should be granted
          expect(hasPermission).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });


  /**
   * Property: Data steward should not have access to user management
   */
  it('should deny data steward access to user management routes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/api/users', '/api/users/123', '/api/users/456/role'),
        httpMethod,
        (route, method) => {
          // Given a data_steward role
          // When checking permission for user management routes
          const hasPermission = hasRoutePermission('data_steward', route, method);

          // Then permission should be denied
          expect(hasPermission).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Compliance officer should have access to workflows
   */
  it('should grant compliance officer access to workflow routes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/api/workflows', '/api/workflows/123'),
        fc.constantFrom('GET', 'POST', 'PUT'),
        (route, method) => {
          // Given a compliance_officer role
          // When checking permission for workflow routes
          const hasPermission = hasRoutePermission('compliance_officer', route, method);

          // Then permission should be granted
          expect(hasPermission).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Unknown roles should have no access
   */
  it('should deny access to unknown roles', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          s => !validRoles.includes(s as typeof validRoles[number])
        ),
        apiRoute,
        httpMethod,
        (unknownRole, route, method) => {
          // Given an unknown role
          // When checking permission
          const hasPermission = hasRoutePermission(unknownRole, route, method);

          // Then permission should be denied
          expect(hasPermission).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Permission check is deterministic
   */
  it('should return consistent results for the same inputs', () => {
    fc.assert(
      fc.property(validRole, apiRoute, httpMethod, (role, route, method) => {
        // Given any valid role, route, and method
        // When checking permission multiple times
        const result1 = hasRoutePermission(role, route, method);
        const result2 = hasRoutePermission(role, route, method);
        const result3 = hasRoutePermission(role, route, method);

        // Then all results should be identical
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: All defined roles should have at least some permissions
   */
  it('should ensure all defined roles have permissions configured', () => {
    fc.assert(
      fc.property(validRole, (role) => {
        // Given any valid role
        // When checking the role's permissions
        const permissions = ROLE_PERMISSIONS[role];

        // Then permissions should be defined
        expect(permissions).toBeDefined();
        expect(permissions.allowedRoutes).toBeDefined();
        expect(permissions.allowedRoutes.length).toBeGreaterThan(0);
        expect(permissions.allowedMethods).toBeDefined();
        expect(permissions.allowedMethods.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: DELETE method should only be available to admin
   */
  it('should restrict DELETE method to admin only', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('compliance_officer', 'data_steward', 'viewer'),
        apiRoute,
        (role, route) => {
          // Given a non-admin role
          // When checking DELETE permission
          const hasPermission = hasRoutePermission(role, route, 'DELETE');

          // Then permission should be denied
          expect(hasPermission).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 *
 * For any API request to /api/agents/{agentType}, the request SHALL be routed
 * to the AgentCore agent ARN corresponding to that agent type.
 *
 * **Validates: Requirements 2.2, 5.2**
 */
describe('Property 1: Agent Routing Correctness', () => {
  // Sample agent ARNs for testing
  const sampleAgentArns: Record<AgentType, string> = {
    regulatory: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/RegulatoryAgent',
    dataRequirements: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/DataRequirementsAgent',
    cdeIdentification: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/CDEIdentificationAgent',
    dataQuality: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/DataQualityAgent',
    lineageMapping: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/LineageMappingAgent',
    issueManagement: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/IssueManagementAgent',
    documentation: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/DocumentationAgent',
    orchestrator: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/OrchestratorAgent',
  };

  // Arbitrary for generating valid agent types
  const validAgentType = fc.constantFrom(...AGENT_TYPES);

  /**
   * Property: All defined agent types should be valid
   */
  it('should recognize all defined agent types as valid', () => {
    fc.assert(
      fc.property(validAgentType, (agentType) => {
        // Given a defined agent type
        // When checking if it's valid
        const isValid = isValidAgentType(agentType);

        // Then it should be valid
        expect(isValid).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid agent types should be rejected
   */
  it('should reject invalid agent types', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          s => !AGENT_TYPES.includes(s as AgentType)
        ),
        (invalidType) => {
          // Given an invalid agent type
          // When checking if it's valid
          const isValid = isValidAgentType(invalidType);

          // Then it should be invalid
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Valid agent types should return correct ARN
   */
  it('should return correct ARN for valid agent types', () => {
    fc.assert(
      fc.property(validAgentType, (agentType) => {
        // Given a valid agent type
        // When getting the agent ARN
        const arn = getAgentArn(agentType, sampleAgentArns);

        // Then the ARN should match the configured ARN
        expect(arn).toBe(sampleAgentArns[agentType]);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Agent ARN lookup is deterministic
   */
  it('should return consistent ARN for the same agent type', () => {
    fc.assert(
      fc.property(validAgentType, (agentType) => {
        // Given a valid agent type
        // When getting the ARN multiple times
        const arn1 = getAgentArn(agentType, sampleAgentArns);
        const arn2 = getAgentArn(agentType, sampleAgentArns);
        const arn3 = getAgentArn(agentType, sampleAgentArns);

        // Then all results should be identical
        expect(arn1).toBe(arn2);
        expect(arn2).toBe(arn3);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Agent type validation is deterministic
   */
  it('should return consistent validation results', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (agentType) => {
        // Given any string
        // When validating it multiple times
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
   * Property: All agent types should have unique ARNs
   */
  it('should have unique ARNs for each agent type', () => {
    const arns = new Set<string>();
    
    for (const agentType of AGENT_TYPES) {
      const arn = getAgentArn(agentType, sampleAgentArns);
      expect(arns.has(arn)).toBe(false);
      arns.add(arn);
    }
    
    expect(arns.size).toBe(AGENT_TYPES.length);
  });
});

