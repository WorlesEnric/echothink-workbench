import type { SurfaceTemplate } from "../types.js";
import { primaryTemplateComponents } from "./imports.js";
import { renderSurfaceDescriptor } from "./shared.js";

export const settingsTemplate: SurfaceTemplate = {
  id: "Settings",
  component: "SettingsPanel",
  requires: { processes: 0 },
  render(ctx) {
    return renderSurfaceDescriptor({
      ctx,
      templateId: "Settings",
      component: primaryTemplateComponents.Settings,
      bindings: {
        effects: Object.keys(ctx.compiled.manifest.effects).sort(),
        permissions: ctx.compiled.manifest.permissions.map((permission) => ({
          id: permission.id,
          roles: [...permission.roles],
        })),
        roles: ctx.compiled.manifest.identity.roles.map((role) => ({
          assignable: role.assignable,
          delegatable: role.delegatable,
          id: role.id,
          name: role.name,
        })),
      },
      actions: {
        processes: ctx.compiled.normalizedProcesses
          .filter((process) => process.requires?.permission !== undefined)
          .map((process) => process.id)
          .sort(),
      },
    });
  },
};
