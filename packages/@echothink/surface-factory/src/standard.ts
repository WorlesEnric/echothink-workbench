import { uiRegistry, type StandardSurfaceContext } from "@echothink/ui-registry";
import type { CompiledManifest } from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import { resolveSurfaceEntity, resolveSurfaceQuery } from "./utils.js";

export function generateStandardSurfaces(
  compiled: CompiledManifest,
): GeneratedFile[] {
  return compiled.surfaceRegistrations
    .filter((surface) => surface.type === "standard")
    .flatMap((surface) => {
      const query = resolveSurfaceQuery(compiled, surface);
      const entity = resolveSurfaceEntity(compiled, surface);
      const ctx: StandardSurfaceContext = {
        compiled,
        surface,
        ...(entity ? { entity } : {}),
        ...(query ? { query: query.definition } : {}),
      };
      return uiRegistry.renderStandardSurface(ctx);
    });
}
