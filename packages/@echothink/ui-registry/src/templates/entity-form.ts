import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import {
  entityBinding,
  fieldBindings,
  processBindings,
  renderSurfaceDescriptor,
  requiredProcessesForSurface,
  requireEntity,
} from "./shared.js";

export const entityFormTemplate: SurfaceTemplate = {
  id: "EntityForm",
  component: "SchemaForm",
  requires: { processes: 1 },
  render(ctx) {
    const entity = requireEntity(ctx);
    const processes = requiredProcessesForSurface(ctx, entity);
    const primaryProcess = processes[0];
    const fields = primaryProcess ? primaryProcess.input : entity.fields;

    return renderSurfaceDescriptor({
      ctx,
      templateId: "EntityForm",
      component: primaryTemplateComponents.EntityForm,
      bindings: {
        entity: entityBinding(entity),
        fields: fieldBindings(fields),
        mode: primaryProcess ? "process" : "entity",
        process: primaryProcess ? processBindings([primaryProcess])[0] : undefined,
      },
      actions: {
        submit: primaryProcess ? processBindings([primaryProcess])[0] : undefined,
      },
    });
  },
};
