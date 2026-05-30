import type { SurfaceType } from "@echothink/shared-types";
import type { GeneratedFile, SurfaceRegistration } from "@echothink/domain-manifest";

import { components } from "./catalog.js";
import { recipes } from "./recipes.js";
import type {
  ComponentImport,
  RegistryComponent,
  StandardSurfaceContext,
} from "./types.js";
import { importsForTemplate, surfaceTemplates } from "./templates/index.js";
import { resolveStandardEntity, resolveSurfaceQuery } from "./templates/shared.js";

export const uiRegistryVersion = "2026.05";

export interface RegistrySearchQuery {
  text?: string;
  kind?: RegistryComponent["kind"];
  surfaceType?: SurfaceType;
}

export type RegistrySearchInput = string | RegistrySearchQuery;

const pageTemplates = surfaceTemplates;
const blocks = components.filter((component) => component.kind === "block");
const componentById = new Map(
  components.map((component) => [component.id, component] as const),
);

export const uiRegistry = {
  components,
  blocks,
  pageTemplates,
  recipes,
  find,
  search,
  uiRegistryVersion,
  renderStandardSurface,
};

export function find(id: string): RegistryComponent | undefined {
  return componentById.get(id);
}

export function search(input: RegistrySearchInput): RegistryComponent[] {
  const q = typeof input === "string" ? { text: input } : input;
  const text = q.text?.trim().toLowerCase();
  return components.filter((component) => {
    if (q.kind && component.kind !== q.kind) {
      return false;
    }
    if (q.surfaceType && !component.surfaceTypes.includes(q.surfaceType)) {
      return false;
    }
    if (!text) {
      return true;
    }
    return searchableText(component).includes(text);
  });
}

export function renderStandardSurface(
  ctx: StandardSurfaceContext,
): GeneratedFile[] {
  const templateId = ctx.surface.page;
  if (!templateId) {
    throw new Error(`Surface ${ctx.surface.id} does not declare a page template`);
  }

  const template = pageTemplates.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`No standard surface template registered for ${templateId}`);
  }

  return template.render(enrichContext(ctx));
}

export function getComponentImportsForSurface(
  surface: SurfaceRegistration,
): ComponentImport[] {
  if (!surface.page) {
    return [];
  }
  return importsForTemplate(surface.page);
}

function enrichContext(ctx: StandardSurfaceContext): StandardSurfaceContext {
  const resolvedQuery = resolveSurfaceQuery(ctx);
  const withQuery = resolvedQuery
    ? { ...ctx, query: resolvedQuery.definition }
    : ctx;
  const entity = ctx.entity ?? resolveStandardEntity(withQuery);
  return entity ? { ...withQuery, entity } : withQuery;
}

function searchableText(component: RegistryComponent): string {
  return [
    component.id,
    component.import,
    component.package,
    component.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
}
