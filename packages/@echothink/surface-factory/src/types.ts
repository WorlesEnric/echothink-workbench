import type { GeneratedFile as ManifestGeneratedFile } from "@echothink/domain-manifest";
import type { SurfaceType } from "@echothink/shared-types";

export interface GenerateOptions {
  now: string;
  gitCommit?: string;
}

export type GeneratedFile = ManifestGeneratedFile;

export interface DomainGenerationResult {
  files: GeneratedFile[];
  surfacesByType: Record<SurfaceType, string[]>;
  warnings: string[];
}
