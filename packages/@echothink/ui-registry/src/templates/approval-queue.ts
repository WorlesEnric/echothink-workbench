import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import {
  entityBinding,
  processBindings,
  renderSurfaceDescriptor,
  requiredProcessesForSurface,
  requireEntity,
} from "./shared.js";

export const approvalQueueTemplate: SurfaceTemplate = {
  id: "ApprovalQueue",
  component: "TaskApprovalPanel",
  requires: { processes: 1 },
  render(ctx) {
    const entity = requireEntity(ctx);
    const processes = requiredProcessesForSurface(ctx, entity);

    return renderSurfaceDescriptor({
      ctx,
      templateId: "ApprovalQueue",
      component: primaryTemplateComponents.ApprovalQueue,
      bindings: {
        entity: entityBinding(entity),
        queue: {
          processIds: processes.map((process) => process.id),
          source: "unitProcesses",
        },
      },
      actions: {
        decisions: processBindings(processes),
      },
    });
  },
};
