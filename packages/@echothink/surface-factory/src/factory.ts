import {
  compileManifest,
  generateKernel,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import type { SurfaceType } from "@echothink/shared-types";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { scaffoldComposedSurface } from "./composed.js";
import { scaffoldCustomSurface } from "./custom.js";
import { generateDocs } from "./docs.js";
import { generateFixtures } from "./fixtures.js";
import { generateGovernanceTests } from "./governance-tests.js";
import { generateQaEvidence } from "./qa-evidence.js";
import { generateStandardSurfaces } from "./standard.js";
import type {
  DomainGenerationResult,
  GenerateOptions,
  GeneratedFile,
} from "./types.js";

export function generateDomain(
  manifestYaml: string,
  opts: GenerateOptions,
): DomainGenerationResult {
  const { manifest } = parseManifestYaml(manifestYaml);
  const compiled = compileManifest(manifest, opts);
  const warnings: string[] = [];
  const surfacesByType = emptySurfacesByType();

  for (const surface of compiled.surfaceRegistrations) {
    surfacesByType[surface.type].push(surface.id);
    if (surface.type === "composed") {
      warnForMissingComposedImports(surface.allowedImports ?? [], surface.id, warnings);
    }
  }

  const files: GeneratedFile[] = [
    ...generateKernel(compiled),
    ...generateStandardSurfaces(compiled),
    ...compiled.surfaceRegistrations
      .filter((surface) => surface.type === "composed")
      .flatMap((surface) => scaffoldComposedSurface(compiled, surface)),
    ...compiled.surfaceRegistrations
      .filter((surface) => surface.type === "custom")
      .flatMap((surface) => scaffoldCustomSurface(compiled, surface)),
    ...generateFixtures(compiled),
    ...generateGovernanceTests(compiled),
    ...generateQaEvidence(compiled),
    ...generateDocs(compiled),
  ];

  return {
    files,
    surfacesByType,
    warnings,
  };
}

export function writeDomain(
  domainDir: string,
  result: DomainGenerationResult,
): void {
  const root = resolve(domainDir);
  for (const file of result.files) {
    const target = resolve(root, file.path);
    assertInside(root, file.path, target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents, "utf8");
  }
}

function emptySurfacesByType(): Record<SurfaceType, string[]> {
  return {
    standard: [],
    composed: [],
    custom: [],
  };
}

function warnForMissingComposedImports(
  allowedImports: readonly string[],
  surfaceId: string,
  warnings: string[],
): void {
  const required = [
    "@echothink/app-domain-sdk",
    "@echothink/app-domain-sdk/react",
    "@echothink-ui/core",
    "@echothink-ui/data",
    "@echothink-ui/layouts",
    "@echothink-ui/task",
    "react",
  ];
  for (const moduleId of required) {
    if (!isImportAllowed(moduleId, allowedImports)) {
      warnings.push(
        `Composed surface ${surfaceId} should allow ${moduleId} for the generated scaffold.`,
      );
    }
  }
}

function isImportAllowed(moduleId: string, allowedImports: readonly string[]): boolean {
  return allowedImports.some(
    (allowed) => moduleId === allowed || moduleId.startsWith(`${allowed}/`),
  );
}

function assertInside(root: string, filePath: string, target: string): void {
  if (isAbsolute(filePath)) {
    throw new Error(`Refusing to write absolute generated path: ${filePath}`);
  }
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refusing to write outside domain dir: ${filePath}`);
  }
}
