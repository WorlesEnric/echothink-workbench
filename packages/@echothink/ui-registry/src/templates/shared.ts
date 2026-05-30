import type {
  CompiledManifest,
  GeneratedFile,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
} from "@echothink/domain-manifest";

import type {
  ComponentImport,
  StandardSurfaceContext,
} from "../types.js";
import { importsForTemplate } from "./imports.js";
import { toStableYaml } from "./yaml.js";

type QueryDefinition = CompiledManifest["manifest"]["queries"][string];

export interface ResolvedQuery {
  id: string;
  definition: QueryDefinition;
}

export interface RenderDescriptorInput {
  ctx: StandardSurfaceContext;
  templateId: string;
  component: ComponentImport;
  bindings: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

export function renderSurfaceDescriptor({
  ctx,
  templateId,
  component,
  bindings,
  actions,
}: RenderDescriptorInput): GeneratedFile[] {
  const descriptor = {
    actions: actions ?? {},
    apiVersion: "echothink.ai/standard-surface/v1",
    bindings,
    imports: importsForTemplate(templateId).map((componentImport) => ({
      ...componentImport,
      style: `${componentImport.package}/styles.css`,
    })),
    kind: "StandardSurface",
    metadata: {
      domainId: ctx.compiled.manifest.metadata.id,
      id: ctx.surface.id,
      route: ctx.surface.route,
      surfaceType: ctx.surface.type,
      title: titleFromSurfaceId(ctx.surface.id),
      uiRegistryVersion: ctx.compiled.manifest.metadata.uiRegistryVersion,
    },
    requiredPermissions: [...ctx.surface.requiredPermissions],
    template: {
      component,
      id: templateId,
      layout: {
        package: "@echothink-ui/layouts",
        imports: ["AppPageLayout", "PageHeader"],
      },
    },
  };

  return [
    {
      path: `surfaces/standard/${ctx.surface.id}.surface.yaml`,
      contents: `${toStableYaml(descriptor)}\n`,
    },
  ];
}

export function resolveSurfaceQuery(
  ctx: StandardSurfaceContext,
): ResolvedQuery | undefined {
  if (ctx.surface.query) {
    const definition = ctx.compiled.manifest.queries[ctx.surface.query];
    if (definition) {
      return { id: ctx.surface.query, definition };
    }
  }

  if (!ctx.query) {
    return undefined;
  }

  const queryEntry = Object.entries(ctx.compiled.manifest.queries).find(
    ([, definition]) => definition === ctx.query,
  );
  if (queryEntry) {
    return { id: queryEntry[0], definition: queryEntry[1] };
  }

  return { id: ctx.surface.query ?? "inline", definition: ctx.query };
}

export function resolveStandardEntity(
  ctx: StandardSurfaceContext,
): NormalizedEntity | undefined {
  if (ctx.entity) {
    return ctx.entity;
  }

  const query = resolveSurfaceQuery(ctx);
  if (query) {
    const queryEntity = findEntityByNameOrKey(ctx.compiled, query.definition.entity);
    if (queryEntity) {
      return queryEntity;
    }
  }

  const processEntity = entityFromSurfaceProcessPermission(ctx);
  if (processEntity) {
    return processEntity;
  }

  const queryPermissionEntity = entityFromSurfaceQueryPermission(ctx);
  if (queryPermissionEntity) {
    return queryPermissionEntity;
  }

  return ctx.compiled.normalizedEntities.length === 1
    ? ctx.compiled.normalizedEntities[0]
    : undefined;
}

export function requireEntity(ctx: StandardSurfaceContext): NormalizedEntity {
  const entity = resolveStandardEntity(ctx);
  if (!entity) {
    throw new Error(`Unable to resolve entity for surface ${ctx.surface.id}`);
  }
  return entity;
}

export function entityBinding(entity: NormalizedEntity): Record<string, unknown> {
  return {
    audit: entity.audit,
    key: entity.key,
    name: entity.name,
    relationships: entity.relationships,
    stateField: entity.stateField,
    stateMachine: entity.stateMachine,
    tenantScope: entity.tenantScope,
  };
}

export function queryBinding(
  query: ResolvedQuery | undefined,
): Record<string, unknown> | undefined {
  if (!query) {
    return undefined;
  }
  return {
    entity: query.definition.entity,
    filter: query.definition.filter,
    id: query.id,
    pageable: query.definition.pageable ?? false,
    permissions: query.definition.permissions,
    sortableBy: query.definition.sortableBy ?? [],
  };
}

export function fieldBindings(fields: NormalizedField[]): Record<string, unknown>[] {
  return fields.map((field) => ({
    arrayOf: field.arrayOf,
    enumValues: field.enumValues,
    kind: field.kind,
    label: labelFromFieldName(field.name),
    name: field.name,
    optional: field.optional,
    refEntity: field.refEntity,
  }));
}

export function processBindings(
  processes: NormalizedProcess[],
): Record<string, unknown>[] {
  return processes.map((process) => ({
    actorType: process.actorType,
    audit: process.audit,
    effects: [...process.effects],
    emits: [...process.emits],
    id: process.id,
    input: fieldBindings(process.input),
    output: fieldBindings(process.output),
    permission: process.requires?.permission,
    policyClass: process.policyClass,
    preconditions: [...process.preconditions],
    reads: [...process.reads],
    transitions: process.transitions.map((transition) => ({ ...transition })),
    writes: [...process.writes],
  }));
}

export function processesForEntity(
  compiled: CompiledManifest,
  entity: NormalizedEntity,
): NormalizedProcess[] {
  return compiled.normalizedProcesses
    .filter((process) => processMatchesEntity(process, entity))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function requiredProcessesForSurface(
  ctx: StandardSurfaceContext,
  entity: NormalizedEntity,
): NormalizedProcess[] {
  const matchingProcesses = processesForEntity(ctx.compiled, entity);
  const requiredPermissions = new Set(ctx.surface.requiredPermissions);
  const permissionMatched = matchingProcesses.filter(
    (process) =>
      process.requires?.permission !== undefined &&
      requiredPermissions.has(process.requires.permission),
  );
  return permissionMatched.length > 0 ? permissionMatched : matchingProcesses;
}

export function titleFromSurfaceId(surfaceId: string): string {
  return surfaceId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function entityFromSurfaceProcessPermission(
  ctx: StandardSurfaceContext,
): NormalizedEntity | undefined {
  const requiredPermissions = new Set(ctx.surface.requiredPermissions);
  const process = ctx.compiled.normalizedProcesses.find(
    (candidate) =>
      candidate.requires?.permission !== undefined &&
      requiredPermissions.has(candidate.requires.permission),
  );
  if (!process) {
    return undefined;
  }
  return entityForProcess(ctx.compiled, process);
}

function entityFromSurfaceQueryPermission(
  ctx: StandardSurfaceContext,
): NormalizedEntity | undefined {
  const requiredPermissions = new Set(ctx.surface.requiredPermissions);
  for (const query of Object.values(ctx.compiled.manifest.queries)) {
    const readPermission = query.permissions?.read;
    if (readPermission && requiredPermissions.has(readPermission)) {
      return findEntityByNameOrKey(ctx.compiled, query.entity);
    }
  }
  return undefined;
}

function entityForProcess(
  compiled: CompiledManifest,
  process: NormalizedProcess,
): NormalizedEntity | undefined {
  const candidates = [
    ...process.writes,
    ...process.reads,
    ...process.transitions.map((transition) => transition.entity),
  ];
  for (const candidate of candidates) {
    const entity = findEntityByNameOrKey(compiled, candidate);
    if (entity) {
      return entity;
    }
  }
  const processPrefix = process.id.split(".")[0];
  return processPrefix ? findEntityByNameOrKey(compiled, processPrefix) : undefined;
}

function processMatchesEntity(
  process: NormalizedProcess,
  entity: NormalizedEntity,
): boolean {
  const identifiers = new Set([entity.name, entity.key]);
  return (
    process.reads.some((read) => identifiers.has(read)) ||
    process.writes.some((write) => identifiers.has(write)) ||
    process.transitions.some((transition) => identifiers.has(transition.entity)) ||
    process.id.startsWith(`${entity.key}.`)
  );
}

function findEntityByNameOrKey(
  compiled: CompiledManifest,
  nameOrKey: string,
): NormalizedEntity | undefined {
  return compiled.normalizedEntities.find(
    (entity) => entity.name === nameOrKey || entity.key === nameOrKey,
  );
}

function labelFromFieldName(fieldName: string): string {
  const spaced = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
