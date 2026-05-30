import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import {
  entityBinding,
  fieldBindings,
  processBindings,
  processesForEntity,
  queryBinding,
  renderSurfaceDescriptor,
  requireEntity,
  resolveSurfaceQuery,
} from "./shared.js";

export const entityTableTemplate: SurfaceTemplate = {
  id: "EntityTable",
  component: "DataTable",
  requires: { query: true, processes: 0 },
  render(ctx) {
    const entity = requireEntity(ctx);
    const query = resolveSurfaceQuery(ctx);
    const processes = processesForEntity(ctx.compiled, entity);

    return renderSurfaceDescriptor({
      ctx,
      templateId: "EntityTable",
      component: primaryTemplateComponents.EntityTable,
      bindings: {
        columns: fieldBindings(entity.fields),
        entity: entityBinding(entity),
        pagination: {
          pageable: query?.definition.pageable ?? false,
        },
        query: queryBinding(query),
        sorting: {
          sortableBy: query?.definition.sortableBy ?? [],
        },
      },
      actions: {
        page: [],
        row: processBindings(processes),
      },
    });
  },
};
