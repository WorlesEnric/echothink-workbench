export interface IdentityContext {
  actorId: string;
  tenantId: string;
  roles: string[];
  groups?: string[];
  impersonating?: boolean;
}

export interface PermCheckCtx {
  target?: string;
  entity?: string;
  entityId?: string;
  process?: string;
  effect?: string;
  input?: unknown;
  reason?: string;
  attributes?: Record<string, unknown>;
}

export function createPermCheckCtx(ctx: PermCheckCtx = {}): PermCheckCtx {
  return ctx;
}

export function hasRole(identity: IdentityContext, role: string): boolean {
  return identity.roles.includes(role);
}

export function inGroup(identity: IdentityContext, group: string): boolean {
  return identity.groups?.includes(group) ?? false;
}

export function isImpersonating(identity: IdentityContext): boolean {
  return identity.impersonating === true;
}
