/**
 * **Feature: regulatory-ai-assistant, Property 4: Access Control Enforcement**
 * 
 * Data access respects user permissions and role-based access control.
 * - Query results are filtered by user permissions
 * - Unauthorized access attempts are logged without data exposure
 * 
 * **Validates: Requirements 10.1, 10.2, 10.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { AssistantServiceImpl } from '../../services/assistant-service.js';
import { InMemoryMemoryService } from '../../services/memory-service.js';
import { ToolServiceImpl } from '../../services/tool-service.js';
import {
  AccessControlContext,
  UserPermissions,
  DataScope,
} from '../../types/assistant.js';

// Property test configuration - reduced for faster execution
const propertyConfig = {
  numRuns: 25,
  verbose: false
};

// ==================== Generators ====================

/**
 * Generator for tenant IDs
 */
const tenantIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `tenant-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for user IDs
 */
const userIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `user-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for entity IDs
 */
const entityIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for entity types
 */
const entityTypeGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom('report', 'cde', 'issue', 'lineage', 'cycle');

/**
 * Generator for permissions
 */
const permissionGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'report:read',
    'report:write',
    'report:approve',
    'cde:read',
    'cde:write',
    'issue:read',
    'issue:write',
    'lineage:read',
    'cycle:read',
    'cycle:write'
  );


/**
 * Generator for access level
 */
const accessLevelGenerator = (): fc.Arbitrary<'read' | 'write' | 'admin'> =>
  fc.constantFrom('read', 'write', 'admin');

/**
 * Generator for data scope
 */
const dataScopeGenerator = (entityType: string): fc.Arbitrary<DataScope> =>
  fc.record({
    entityType: fc.constant(entityType),
    allowedIds: fc.option(fc.array(entityIdGenerator(), { minLength: 1, maxLength: 5 })),
    deniedIds: fc.option(fc.array(entityIdGenerator(), { minLength: 1, maxLength: 3 })),
    accessLevel: accessLevelGenerator(),
  }).map(scope => ({
    ...scope,
    allowedIds: scope.allowedIds ?? undefined,
    deniedIds: scope.deniedIds ?? undefined,
  }));

/**
 * Generator for user permissions
 */
const userPermissionsGenerator = (): fc.Arbitrary<UserPermissions> =>
  fc.record({
    userId: userIdGenerator(),
    tenantId: tenantIdGenerator(),
    role: fc.constantFrom('analyst', 'steward', 'approver', 'admin'),
    permissions: fc.array(permissionGenerator(), { minLength: 0, maxLength: 5 }),
    dataScopes: fc.array(
      fc.oneof(
        dataScopeGenerator('report'),
        dataScopeGenerator('cde'),
        dataScopeGenerator('issue')
      ),
      { minLength: 0, maxLength: 3 }
    ),
  });

/**
 * Generator for data items with IDs
 */
const dataItemGenerator = (entityType: string): fc.Arbitrary<{ id: string; entityType: string; name: string }> =>
  fc.record({
    id: entityIdGenerator(),
    entityType: fc.constant(entityType),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  });

// ==================== Property Tests ====================

describe('Property 4: Access Control Enforcement', () => {
  let assistantService: AssistantServiceImpl;
  let memoryService: InMemoryMemoryService;
  let toolService: ToolServiceImpl;

  beforeEach(() => {
    memoryService = new InMemoryMemoryService();
    toolService = new ToolServiceImpl({ enableLogging: true });
    assistantService = new AssistantServiceImpl(memoryService, toolService);
    assistantService.clearAccessAuditLog();
  });


  describe('Permission-Based Filtering', () => {
    it('should filter out data when user lacks read permission for entity type', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          entityTypeGenerator(),
          fc.array(dataItemGenerator('report'), { minLength: 1, maxLength: 10 }),
          async (permissions, entityType, data) => {
            // Ensure user does NOT have read permission for this entity type
            const readPermission = `${entityType}:read`;
            const filteredPermissions: UserPermissions = {
              ...permissions,
              permissions: permissions.permissions.filter(p => 
                p !== readPermission && 
                !p.includes('*') && 
                p !== 'admin'
              ),
              dataScopes: [], // No scopes defined
            };

            const context: AccessControlContext = {
              permissions: filteredPermissions,
              enableAuditLogging: true,
            };

            // Filter the data
            const result = await assistantService.filterByAccessControl(
              data,
              entityType,
              context
            );

            // Without read permission and no scope, should return empty
            expect(result).toHaveLength(0);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should allow data access when user has read permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          entityTypeGenerator(),
          fc.array(dataItemGenerator('report'), { minLength: 1, maxLength: 10 }),
          async (basePermissions, entityType, data) => {
            // Ensure user HAS read permission for this entity type
            const readPermission = `${entityType}:read`;
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [...basePermissions.permissions, readPermission],
              dataScopes: [], // No specific scopes - general access
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: false,
            };

            // Filter the data
            const result = await assistantService.filterByAccessControl(
              data,
              entityType,
              context
            );

            // With read permission and no restrictive scope, should return all data
            expect(result).toHaveLength(data.length);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should filter data based on allowed IDs in scope', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          fc.array(entityIdGenerator(), { minLength: 2, maxLength: 5 }),
          fc.array(entityIdGenerator(), { minLength: 2, maxLength: 5 }),
          async (basePermissions, allowedIds, otherIds) => {
            // Ensure no overlap between allowed and other IDs
            const uniqueOtherIds = otherIds.filter(id => !allowedIds.includes(id));
            fc.pre(uniqueOtherIds.length > 0);

            const entityType = 'report';
            
            // Create data with both allowed and non-allowed IDs
            const allowedData = allowedIds.map(id => ({ id, entityType, name: `Allowed ${id}` }));
            const otherData = uniqueOtherIds.map(id => ({ id, entityType, name: `Other ${id}` }));
            const allData = [...allowedData, ...otherData];

            // Create permissions with scope limiting to allowed IDs
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [`${entityType}:read`],
              dataScopes: [{
                entityType,
                allowedIds,
                accessLevel: 'read',
              }],
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: false,
            };

            // Filter the data
            const result = await assistantService.filterByAccessControl(
              allData,
              entityType,
              context
            );

            // Should only return items with allowed IDs
            expect(result.length).toBe(allowedIds.length);
            for (const item of result) {
              expect(allowedIds).toContain(item.id);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });


    it('should filter out data based on denied IDs in scope', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          fc.array(entityIdGenerator(), { minLength: 3, maxLength: 8 }),
          async (basePermissions, allIds) => {
            // Take first ID as denied, rest as allowed
            const deniedIds = [allIds[0]];
            const nonDeniedIds = allIds.slice(1);

            fc.pre(nonDeniedIds.length > 0);

            const entityType = 'cde';
            
            // Create data with all IDs
            const allData = allIds.map(id => ({ id, entityType, name: `Item ${id}` }));

            // Create permissions with scope denying some IDs
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [`${entityType}:read`],
              dataScopes: [{
                entityType,
                deniedIds,
                accessLevel: 'read',
              }],
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: false,
            };

            // Filter the data
            const result = await assistantService.filterByAccessControl(
              allData,
              entityType,
              context
            );

            // Should not contain any denied IDs
            for (const item of result) {
              expect(deniedIds).not.toContain(item.id);
            }

            // Should contain all non-denied IDs
            expect(result.length).toBe(nonDeniedIds.length);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Unauthorized Access Logging', () => {
    it('should log unauthorized access attempts without exposing data', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          entityTypeGenerator(),
          fc.array(dataItemGenerator('report'), { minLength: 1, maxLength: 5 }),
          async (basePermissions, entityType, data) => {
            // Clear audit log
            assistantService.clearAccessAuditLog();

            // Ensure user does NOT have permission
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [], // No permissions
              dataScopes: [],
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: true, // Enable logging
            };

            // Attempt to access data
            const result = await assistantService.filterByAccessControl(
              data,
              entityType,
              context
            );

            // Should return empty (no data exposed)
            expect(result).toHaveLength(0);

            // Should have logged the unauthorized attempt
            const auditLog = assistantService.getAccessAuditLog();
            const unauthorizedEntry = auditLog.find(
              entry => entry.action === 'unauthorized_attempt'
            );

            expect(unauthorizedEntry).toBeDefined();
            expect(unauthorizedEntry!.userId).toBe(permissions.userId);
            expect(unauthorizedEntry!.tenantId).toBe(permissions.tenantId);
            expect(unauthorizedEntry!.entityType).toBe(entityType);
            expect(unauthorizedEntry!.accessGranted).toBe(false);
            expect(unauthorizedEntry!.denialReason).toBeDefined();

            return true;
          }
        ),
        propertyConfig
      );
    });


    it('should not log when audit logging is disabled', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          entityTypeGenerator(),
          fc.array(dataItemGenerator('report'), { minLength: 1, maxLength: 5 }),
          async (basePermissions, entityType, data) => {
            // Clear audit log
            assistantService.clearAccessAuditLog();

            // Ensure user does NOT have permission
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [],
              dataScopes: [],
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: false, // Disable logging
            };

            // Attempt to access data
            await assistantService.filterByAccessControl(
              data,
              entityType,
              context
            );

            // Should NOT have logged anything
            const auditLog = assistantService.getAccessAuditLog();
            expect(auditLog).toHaveLength(0);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Permission Checking', () => {
    it('should grant access with direct permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          permissionGenerator(),
          async (basePermissions, requiredPermission) => {
            // Add the required permission
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [...basePermissions.permissions, requiredPermission],
            };

            const hasAccess = assistantService.hasPermission(permissions, requiredPermission);
            expect(hasAccess).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should grant access with wildcard permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          entityTypeGenerator(),
          async (basePermissions, entityType) => {
            // Add wildcard permission for the entity type
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [`${entityType}:*`],
            };

            // Should have access to any action on this entity type
            expect(assistantService.hasPermission(permissions, `${entityType}:read`)).toBe(true);
            expect(assistantService.hasPermission(permissions, `${entityType}:write`)).toBe(true);
            expect(assistantService.hasPermission(permissions, `${entityType}:approve`)).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should grant access with admin permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          permissionGenerator(),
          async (basePermissions, requiredPermission) => {
            // Add admin permission
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: ['admin'],
            };

            const hasAccess = assistantService.hasPermission(permissions, requiredPermission);
            expect(hasAccess).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should deny access without matching permission', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          permissionGenerator(),
          async (basePermissions, requiredPermission) => {
            // Remove the required permission and any wildcards
            const [category] = requiredPermission.split(':');
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: basePermissions.permissions.filter(p => 
                p !== requiredPermission && 
                p !== `${category}:*` && 
                p !== '*:*' && 
                p !== 'admin'
              ),
            };

            const hasAccess = assistantService.hasPermission(permissions, requiredPermission);
            expect(hasAccess).toBe(false);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });


  describe('Tenant Isolation in Access Control', () => {
    it('should scope access control to tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(tenantIdGenerator(), tenantIdGenerator()).filter(([t1, t2]) => t1 !== t2),
          userIdGenerator(),
          entityTypeGenerator(),
          fc.array(dataItemGenerator('report'), { minLength: 1, maxLength: 5 }),
          async ([tenantA, tenantB], userId, entityType, data) => {
            // Clear audit log
            assistantService.clearAccessAuditLog();

            // Create permissions for tenant A
            const permissionsA: UserPermissions = {
              userId,
              tenantId: tenantA,
              role: 'analyst',
              permissions: [`${entityType}:read`],
              dataScopes: [],
            };

            // Create permissions for tenant B (no access)
            const permissionsB: UserPermissions = {
              userId,
              tenantId: tenantB,
              role: 'analyst',
              permissions: [], // No permissions
              dataScopes: [],
            };

            const contextA: AccessControlContext = {
              permissions: permissionsA,
              enableAuditLogging: true,
            };

            const contextB: AccessControlContext = {
              permissions: permissionsB,
              enableAuditLogging: true,
            };

            // Tenant A should have access
            const resultA = await assistantService.filterByAccessControl(
              data,
              entityType,
              contextA
            );
            expect(resultA.length).toBe(data.length);

            // Tenant B should NOT have access
            const resultB = await assistantService.filterByAccessControl(
              data,
              entityType,
              contextB
            );
            expect(resultB.length).toBe(0);

            // Verify audit log shows different tenants
            const auditLog = assistantService.getAccessAuditLog();
            const tenantBEntry = auditLog.find(
              entry => entry.tenantId === tenantB && entry.action === 'unauthorized_attempt'
            );
            expect(tenantBEntry).toBeDefined();

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Combined Scope Filtering', () => {
    it('should apply both allowed and denied IDs correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          userPermissionsGenerator(),
          fc.array(entityIdGenerator(), { minLength: 5, maxLength: 10 }),
          async (basePermissions, allIds) => {
            // Split IDs into allowed, denied, and other
            const allowedIds = allIds.slice(0, 3);
            const deniedIds = [allIds[0]]; // Deny one of the allowed IDs
            const expectedIds = allowedIds.filter(id => !deniedIds.includes(id));

            fc.pre(expectedIds.length > 0);

            const entityType = 'issue';
            
            // Create data with all IDs
            const allData = allIds.map(id => ({ id, entityType, name: `Item ${id}` }));

            // Create permissions with both allowed and denied IDs
            const permissions: UserPermissions = {
              ...basePermissions,
              permissions: [`${entityType}:read`],
              dataScopes: [{
                entityType,
                allowedIds,
                deniedIds,
                accessLevel: 'read',
              }],
            };

            const context: AccessControlContext = {
              permissions,
              enableAuditLogging: false,
            };

            // Filter the data
            const result = await assistantService.filterByAccessControl(
              allData,
              entityType,
              context
            );

            // Should only contain IDs that are allowed AND not denied
            expect(result.length).toBe(expectedIds.length);
            for (const item of result) {
              expect(expectedIds).toContain(item.id);
              expect(deniedIds).not.toContain(item.id);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
