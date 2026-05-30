import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import {
  entityBinding,
  fieldBindings,
  processBindings,
  processesForEntity,
  renderSurfaceDescriptor,
  requireEntity,
} from "./shared.js";

export const entityDetailTemplate: SurfaceTemplate = {
  id: "EntityDetail",
  component: "PropertyList",
  requires: { processes: 0 },
  render(ctx) {
    const entity = requireEntity(ctx);
    const processes = processesForEntity(ctx.compiled, entity);

    return renderSurfaceDescriptor({
      ctx,
      templateId: "EntityDetail",
      component: primaryTemplateComponents.EntityDetail,
      bindings: {
        entity: entityBinding(entity),
        fields: fieldBindings(entity.fields),
        lookup: {
          entity: entity.name,
          idParam: "id",
        },
      },
      actions: {
        record: processBindings(processes),
      },
    });
  },
};
