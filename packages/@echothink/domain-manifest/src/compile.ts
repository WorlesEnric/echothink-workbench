import { sha256OfCanonical } from "@echothink/shared-types";
import { normalizeEntities, normalizeProcesses } from "./normalizers.js";
import type { AppDomainManifest } from "./schema.js";
import type {
  CapabilityMap,
  CompiledManifest,
  CompileOptions,
  PermissionCapability,
  PermissionMatrixRow,
  SurfaceRegistration,
} from "./types.js";

export function compileManifest(
  manifest: AppDomainManifest,
  opts: CompileOptions,
): CompiledManifest {
  const normalizedEntities = normalizeEntities(manifest.entities);
  const normalizedProcesses = normalizeProcesses(manifest.unitProcesses);
  const permissionMatrix = buildPermissionMatrix(manifest);
  const capabilityMap = buildCapabilityMap(manifest);
  const surfaceRegistrations = buildSurfaceRegistrations(manifest);
  const normalizedManifest = {
    manifest,
    normalizedEntities,
    normalizedProcesses,
    permissionMatrix,
    capabilityMap,
    surfaceRegistrations,
  };

  return {
    manifest,
    normalizedEntities,
    normalizedProcesses,
    permissionMatrix,
    capabilityMap,
    manifestDigest: sha256OfCanonical(normalizedManifest),
    surfaceRegistrations,
    compiledAt: opts.now,
  };
}

function buildPermissionMatrix(
  manifest: AppDomainManifest,
): PermissionMatrixRow[] {
  const roles = manifest.identity.roles.map((role) => role.id);
  const rows: PermissionMatrixRow[] = [];

  for (const [processId, process] of Object.entries(manifest.unitProcesses)) {
    pushRowsForTarget(rows, manifest, roles, {
      capability: "process.run",
      target: processId,
      permission: process.requires?.permission,
    });
  }

  for (const [queryId, query] of Object.entries(manifest.queries)) {
    pushRowsForTarget(rows, manifest, roles, {
      capability: "entity.query",
      target: queryId,
      permission: query.permissions?.read,
    });
  }

  for (const entityName of Object.keys(manifest.entities)) {
    pushRowsForTarget(rows, manifest, roles, {
      capability: "entity.get",
      target: entityName,
      permission: permissionForEntityRead(manifest, entityName),
    });
  }

  for (const eventId of Object.keys(manifest.events)) {
    pushRowsForTarget(rows, manifest, roles, {
      capability: "event.subscribe",
      target: eventId,
    });
  }

  for (const [effectId, effect] of Object.entries(manifest.effects)) {
    pushRowsForTarget(rows, manifest, roles, {
      capability: "effect.invoke",
      target: effectId,
      permission: effect.requiredPermission,
    });
  }

  return rows;
}

function pushRowsForTarget(
  rows: PermissionMatrixRow[],
  manifest: AppDomainManifest,
  roles: string[],
  input: {
    capability: PermissionCapability;
    target: string;
    permission?: string;
  },
): void {
  const allowedRoles = input.permission
    ? rolesForPermission(manifest, input.permission)
    : new Set(roles);

  for (const role of roles) {
    rows.push({
      role,
      capability: input.capability,
      target: input.target,
      ...(input.permission ? { permission: input.permission } : {}),
      allowed: allowedRoles.has(role),
    });
  }
}

function rolesForPermission(
  manifest: AppDomainManifest,
  permissionId: string,
): Set<string> {
  const permission = manifest.permissions.find(
    (candidate) => candidate.id === permissionId,
  );
  return new Set(permission?.roles ?? []);
}

function permissionForEntityRead(
  manifest: AppDomainManifest,
  entityName: string,
): string | undefined {
  const entity = manifest.entities[entityName];
  if (!entity) {
    return undefined;
  }
  for (const query of Object.values(manifest.queries)) {
    if (query.entity === entityName || query.entity === entity.key) {
      return query.permissions?.read;
    }
  }
  return undefined;
}

function buildCapabilityMap(manifest: AppDomainManifest): CapabilityMap {
  return {
    entities: Object.keys(manifest.entities).flatMap((entityName) => [
      `entity.query:${entityName}`,
      `entity.get:${entityName}`,
    ]),
    queries: Object.keys(manifest.queries).map((queryId) => `query:${queryId}`),
    processes: Object.keys(manifest.unitProcesses).map(
      (processId) => `process.run:${processId}`,
    ),
    events: Object.keys(manifest.events).map(
      (eventId) => `event.subscribe:${eventId}`,
    ),
    effects: Object.keys(manifest.effects).map((effectId) => `effect:${effectId}`),
  };
}

function buildSurfaceRegistrations(
  manifest: AppDomainManifest,
): SurfaceRegistration[] {
  return manifest.surfaces.map((surface) => ({
    id: surface.id,
    type: surface.type,
    route: surface.route,
    ...(surface.page ? { page: surface.page } : {}),
    ...(surface.query ? { query: surface.query } : {}),
    requiredPermissions: [...(surface.requiredPermissions ?? [])],
    ...(surface.entry ? { entry: surface.entry } : {}),
    ...(surface.allowedImports
      ? { allowedImports: [...surface.allowedImports] }
      : {}),
    ...(surface.isolation ? { isolation: surface.isolation } : {}),
  }));
}
