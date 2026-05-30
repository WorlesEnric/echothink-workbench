import { KNOWN_STANDARD_PAGES } from "./constants.js";
import { normalizeEntities, normalizeProcesses } from "./normalizers.js";
import type { AppDomainManifest } from "./schema.js";
import type {
  NormalizedEntity,
  NormalizedField,
  NormalizedTransition,
  SemanticDiagnostic,
} from "./types.js";

export function validateManifestSemantics(
  manifest: AppDomainManifest,
): SemanticDiagnostic[] {
  const diagnostics: SemanticDiagnostic[] = [];
  const permissionIds = new Set(manifest.permissions.map((permission) => permission.id));
  const roleIds = new Set(manifest.identity.roles.map((role) => role.id));
  const processIds = new Set(Object.keys(manifest.unitProcesses));
  const eventIds = new Set(Object.keys(manifest.events));
  const effectIds = new Set(Object.keys(manifest.effects));
  const queryIds = new Set(Object.keys(manifest.queries));
  const entityNames = new Set(Object.keys(manifest.entities));
  const entityKeys = new Set(
    Object.values(manifest.entities).map((entity) => entity.key),
  );
  const normalizedEntities = normalizeEntities(manifest.entities);
  const normalizedProcesses = normalizeProcesses(manifest.unitProcesses);

  pushDuplicateDiagnostics(
    diagnostics,
    manifest.identity.roles.map((role, index) => ({
      id: role.id,
      path: `/identity/roles/${index}/id`,
      label: "role",
    })),
  );
  pushDuplicateDiagnostics(
    diagnostics,
    manifest.permissions.map((permission, index) => ({
      id: permission.id,
      path: `/permissions/${index}/id`,
      label: "permission",
    })),
  );
  pushDuplicateDiagnostics(
    diagnostics,
    manifest.surfaces.map((surface, index) => ({
      id: surface.id,
      path: `/surfaces/${index}/id`,
      label: "surface",
    })),
  );
  pushDuplicateDiagnostics(
    diagnostics,
    Object.keys(manifest.unitProcesses).map((id) => ({
      id,
      path: `/unitProcesses/${id}`,
      label: "process",
    })),
  );
  pushDuplicateDiagnostics(
    diagnostics,
    Object.keys(manifest.events).map((id) => ({
      id,
      path: `/events/${id}`,
      label: "event",
    })),
  );
  pushDuplicateDiagnostics(
    diagnostics,
    Object.keys(manifest.effects).map((id) => ({
      id,
      path: `/effects/${id}`,
      label: "effect",
    })),
  );

  for (const [index, permission] of manifest.permissions.entries()) {
    for (const [roleIndex, role] of permission.roles.entries()) {
      if (!roleIds.has(role)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_ROLE",
          message: `Permission "${permission.id}" references unknown role "${role}".`,
          path: `/permissions/${index}/roles/${roleIndex}`,
        });
      }
    }
  }

  for (const [index, persona] of (manifest.identity.personas ?? []).entries()) {
    if (!roleIds.has(persona.role)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_ROLE",
        message: `Persona "${persona.id}" references unknown role "${persona.role}".`,
        path: `/identity/personas/${index}/role`,
      });
    }
  }

  for (const [queryId, query] of Object.entries(manifest.queries)) {
    if (!entityExists(query.entity, entityNames, entityKeys)) {
      diagnostics.push({
        severity: "error",
        code: "DANGLING_ENTITY_REF",
        message: `Query "${queryId}" references unknown entity "${query.entity}".`,
        path: `/queries/${queryId}/entity`,
      });
    }
    if (query.permissions?.read && !permissionIds.has(query.permissions.read)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_PERMISSION",
        message: `Query "${queryId}" references unknown read permission "${query.permissions.read}".`,
        path: `/queries/${queryId}/permissions/read`,
      });
    }
  }

  for (const [entityName, entity] of Object.entries(manifest.entities)) {
    for (const [fieldIndex, field] of normalizedEntityFor(
      normalizedEntities,
      entityName,
    ).fields.entries()) {
      if (field.kind === "ref" && field.refEntity) {
        if (!entityExists(field.refEntity, entityNames, entityKeys)) {
          diagnostics.push({
            severity: "error",
            code: "DANGLING_ENTITY_REF",
            message: `Field "${entityName}.${field.name}" references unknown entity "${field.refEntity}".`,
            path: `/entities/${entityName}/schema/${field.name}`,
          });
        }
      }
      void fieldIndex;
    }

    for (const [relationshipName, relationship] of Object.entries(
      entity.relationships ?? {},
    )) {
      if (!entityExists(relationship.entity, entityNames, entityKeys)) {
        diagnostics.push({
          severity: "error",
          code: "DANGLING_ENTITY_REF",
          message: `Relationship "${entityName}.${relationshipName}" references unknown entity "${relationship.entity}".`,
          path: `/entities/${entityName}/relationships/${relationshipName}/entity`,
        });
      }
    }

    if (entity.stateMachine) {
      const stateField = entity.stateField;
      const enumField = stateField
        ? findField(normalizedEntityFor(normalizedEntities, entityName), stateField)
        : undefined;
      const allowedStates = enumField?.enumValues;
      if (allowedStates) {
        if (!allowedStates.includes(entity.stateMachine.initial)) {
          diagnostics.push({
            severity: "error",
            code: "UNKNOWN_STATE",
            message: `State machine for "${entityName}" uses unknown initial state "${entity.stateMachine.initial}".`,
            path: `/entities/${entityName}/stateMachine/initial`,
          });
        }
        for (const [index, transition] of entity.stateMachine.transitions.entries()) {
          pushUnknownStateDiagnostic(
            diagnostics,
            allowedStates,
            transition.from,
            `/entities/${entityName}/stateMachine/transitions/${index}/from`,
            entityName,
          );
          pushUnknownStateDiagnostic(
            diagnostics,
            allowedStates,
            transition.to,
            `/entities/${entityName}/stateMachine/transitions/${index}/to`,
            entityName,
          );
        }
      }

      for (const [index, transition] of entity.stateMachine.transitions.entries()) {
        if (transition.via && !processIds.has(transition.via)) {
          diagnostics.push({
            severity: "error",
            code: "UNKNOWN_TRANSITION_PROCESS",
            message: `State transition "${entityName}" references unknown process "${transition.via}".`,
            path: `/entities/${entityName}/stateMachine/transitions/${index}/via`,
          });
        }
      }
    }
  }

  for (const process of normalizedProcesses) {
    const rawProcess = manifest.unitProcesses[process.id];
    if (process.requires?.permission && !permissionIds.has(process.requires.permission)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_PERMISSION",
        message: `Process "${process.id}" references unknown permission "${process.requires.permission}".`,
        path: `/unitProcesses/${process.id}/requires/permission`,
      });
    }

    for (const [index, entityName] of process.reads.entries()) {
      if (!entityExists(entityName, entityNames, entityKeys)) {
        diagnostics.push({
          severity: "error",
          code: "DANGLING_ENTITY_REF",
          message: `Process "${process.id}" reads unknown entity "${entityName}".`,
          path: `/unitProcesses/${process.id}/reads/${index}`,
        });
      }
    }
    for (const [index, entityName] of process.writes.entries()) {
      if (!entityExists(entityName, entityNames, entityKeys)) {
        diagnostics.push({
          severity: "error",
          code: "DANGLING_ENTITY_REF",
          message: `Process "${process.id}" writes unknown entity "${entityName}".`,
          path: `/unitProcesses/${process.id}/writes/${index}`,
        });
      }
    }
    for (const [index, eventId] of process.emits.entries()) {
      if (!eventIds.has(eventId)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_EVENT",
          message: `Process "${process.id}" emits unknown event "${eventId}".`,
          path: `/unitProcesses/${process.id}/emits/${index}`,
        });
      }
    }
    for (const [index, effectId] of process.effects.entries()) {
      if (!effectIds.has(effectId)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_EFFECT",
          message: `Process "${process.id}" references unknown effect "${effectId}".`,
          path: `/unitProcesses/${process.id}/effects/${index}`,
        });
      }
    }

    for (const transition of process.transitions) {
      validateProcessTransition(
        diagnostics,
        process.id,
        transition,
        normalizedEntities,
        entityNames,
        entityKeys,
      );
    }

    if (rawProcess?.compensation && !processIds.has(rawProcess.compensation)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_TRANSITION_PROCESS",
        message: `Process "${process.id}" compensates with unknown process "${rawProcess.compensation}".`,
        path: `/unitProcesses/${process.id}/compensation`,
      });
    }
  }

  for (const [effectId, effect] of Object.entries(manifest.effects)) {
    if (effect.requiredPermission && !permissionIds.has(effect.requiredPermission)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_PERMISSION",
        message: `Effect "${effectId}" references unknown permission "${effect.requiredPermission}".`,
        path: `/effects/${effectId}/requiredPermission`,
      });
    }
  }

  for (const [index, surface] of manifest.surfaces.entries()) {
    for (const [permissionIndex, permission] of (
      surface.requiredPermissions ?? []
    ).entries()) {
      if (!permissionIds.has(permission)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_PERMISSION",
          message: `Surface "${surface.id}" references unknown permission "${permission}".`,
          path: `/surfaces/${index}/requiredPermissions/${permissionIndex}`,
        });
      }
    }
    if (surface.query && !queryIds.has(surface.query)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_QUERY",
        message: `Surface "${surface.id}" references unknown query "${surface.query}".`,
        path: `/surfaces/${index}/query`,
      });
    }
    if (
      surface.type === "standard"
      && surface.page
      && !KNOWN_STANDARD_PAGES.includes(
        surface.page as (typeof KNOWN_STANDARD_PAGES)[number],
      )
    ) {
      diagnostics.push({
        severity: "warning",
        code: "UNVERIFIED_PAGE",
        message: `Standard surface "${surface.id}" references unverified page template "${surface.page}".`,
        path: `/surfaces/${index}/page`,
      });
    }
  }

  return diagnostics;
}

function pushDuplicateDiagnostics(
  diagnostics: SemanticDiagnostic[],
  entries: Array<{ id: string; path: string; label: string }>,
): void {
  const firstSeen = new Map<string, string>();
  for (const entry of entries) {
    const firstPath = firstSeen.get(entry.id);
    if (firstPath) {
      diagnostics.push({
        severity: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate ${entry.label} id "${entry.id}" also appears at "${firstPath}".`,
        path: entry.path,
      });
      continue;
    }
    firstSeen.set(entry.id, entry.path);
  }
}

function validateProcessTransition(
  diagnostics: SemanticDiagnostic[],
  processId: string,
  transition: NormalizedTransition,
  normalizedEntities: NormalizedEntity[],
  entityNames: Set<string>,
  entityKeys: Set<string>,
): void {
  if (!entityExists(transition.entity, entityNames, entityKeys)) {
    diagnostics.push({
      severity: "error",
      code: "DANGLING_ENTITY_REF",
      message: `Process "${processId}" transition references unknown entity "${transition.entity}".`,
      path: `/unitProcesses/${processId}/transitions/${transition.target}`,
    });
    return;
  }

  const entity = normalizedEntities.find(
    (candidate) =>
      candidate.name === transition.entity || candidate.key === transition.entity,
  );
  if (!entity) {
    return;
  }
  const field = findField(entity, transition.field);
  if (!field?.enumValues) {
    return;
  }

  if (transition.kind === "exact") {
    if (transition.from !== undefined) {
      pushUnknownStateDiagnostic(
        diagnostics,
        field.enumValues,
        transition.from,
        `/unitProcesses/${processId}/transitions/${transition.target}/from`,
        entity.name,
      );
    }
    if (transition.to !== undefined) {
      pushUnknownStateDiagnostic(
        diagnostics,
        field.enumValues,
        transition.to,
        `/unitProcesses/${processId}/transitions/${transition.target}/to`,
        entity.name,
      );
    }
    return;
  }

  for (const [inputValue, targetState] of Object.entries(transition.mapping)) {
    pushUnknownStateDiagnostic(
      diagnostics,
      field.enumValues,
      targetState,
      `/unitProcesses/${processId}/transitions/${transition.target}/${inputValue}`,
      entity.name,
    );
  }
}

function pushUnknownStateDiagnostic(
  diagnostics: SemanticDiagnostic[],
  allowedStates: string[],
  state: string,
  path: string,
  entityName: string,
): void {
  if (allowedStates.includes(state)) {
    return;
  }
  diagnostics.push({
    severity: "error",
    code: "UNKNOWN_STATE",
    message: `Entity "${entityName}" does not declare state "${state}".`,
    path,
  });
}

function normalizedEntityFor(
  entities: NormalizedEntity[],
  entityName: string,
): NormalizedEntity {
  const entity = entities.find((candidate) => candidate.name === entityName);
  if (!entity) {
    throw new Error(`Missing normalized entity "${entityName}"`);
  }
  return entity;
}

function findField(
  entity: NormalizedEntity,
  fieldName: string,
): NormalizedField | undefined {
  return entity.fields.find((field) => field.name === fieldName);
}

function entityExists(
  value: string,
  entityNames: Set<string>,
  entityKeys: Set<string>,
): boolean {
  return entityNames.has(value) || entityKeys.has(value);
}
