import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import {
  entityBinding,
  processBindings,
  processesForEntity,
  renderSurfaceDescriptor,
  resolveStandardEntity,
} from "./shared.js";

export const auditLogTemplate: SurfaceTemplate = {
  id: "AuditLog",
  component: "AuditLogTable",
  requires: { processes: 0 },
  render(ctx) {
    const entity = resolveStandardEntity(ctx);
    const processes = entity ? processesForEntity(ctx.compiled, entity) : [];

    return renderSurfaceDescriptor({
      ctx,
      templateId: "AuditLog",
      component: primaryTemplateComponents.AuditLog,
      bindings: {
        auditColumns: [
          { kind: "date", name: "timestamp" },
          { kind: "string", name: "actorId" },
          { kind: "string", name: "target" },
          { kind: "string", name: "operation" },
          { kind: "string", name: "reason" },
        ],
        entity: entity ? entityBinding(entity) : undefined,
        events: Object.keys(ctx.compiled.manifest.events).sort(),
      },
      actions: {
        auditedProcesses: processBindings(processes),
      },
    });
  },
};
