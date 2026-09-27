import type { FastifyRequest } from 'fastify';

/**
 * JWT payload structure for RS256-signed tokens.
 */
export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  roles: string[];
  exp: number;
  iat: number;
}

/**
 * Authenticated request context injected by JWT middleware.
 */
export interface AuthenticatedContext {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

// Extend Fastify's request type to include auth context
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthenticatedContext;
  }
}

/**
 * RBAC permission matrix — maps roles to allowed actions.
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:delete'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'campaigns:send'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:activate'
  | 'calls:read'
  | 'calls:write'
  | 'surveys:read'
  | 'surveys:write'
  | 'reports:read'
  | 'billing:read'
  | 'billing:write'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'settings:read'
  | 'settings:write'
  | 'api_keys:read'
  | 'api_keys:write';

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  owner: [
    'contacts:read', 'contacts:write', 'contacts:delete',
    'campaigns:read', 'campaigns:write', 'campaigns:send',
    'workflows:read', 'workflows:write', 'workflows:activate',
    'calls:read', 'calls:write',
    'surveys:read', 'surveys:write',
    'reports:read',
    'billing:read', 'billing:write',
    'users:read', 'users:write', 'users:delete',
    'settings:read', 'settings:write',
    'api_keys:read', 'api_keys:write',
  ],
  admin: [
    'contacts:read', 'contacts:write', 'contacts:delete',
    'campaigns:read', 'campaigns:write', 'campaigns:send',
    'workflows:read', 'workflows:write', 'workflows:activate',
    'calls:read', 'calls:write',
    'surveys:read', 'surveys:write',
    'reports:read',
    'billing:read',
    'users:read', 'users:write',
    'settings:read', 'settings:write',
    'api_keys:read', 'api_keys:write',
  ],
  member: [
    'contacts:read', 'contacts:write',
    'campaigns:read', 'campaigns:write',
    'workflows:read',
    'calls:read', 'calls:write',
    'surveys:read', 'surveys:write',
    'reports:read',
    'users:read',
    'settings:read',
    'api_keys:read',
  ],
  viewer: [
    'contacts:read',
    'campaigns:read',
    'workflows:read',
    'calls:read',
    'surveys:read',
    'reports:read',
    'users:read',
    'settings:read',
  ],
};

/**
 * Check if a set of roles grants a specific permission.
 */
export function hasPermission(roles: string[], permission: Permission): boolean {
  return roles.some((role) => {
    const perms = PERMISSION_MATRIX[role as Role];
    return perms !== undefined && perms.includes(permission);
  });
}
