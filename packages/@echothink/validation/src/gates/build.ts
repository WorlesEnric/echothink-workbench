import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256OfString } from "@echothink/shared-types";
import ts from "typescript";
import type { Gate, GateFinding } from "../types.js";
import {
  composedOrCustomSurfaceFiles,
  errorFinding,
  gateResult,
  listFilesRecursive,
  readUtf8,
  relativeFile,
  sourceExtension,
  surfaceDirectory,
  warningFinding,
} from "./common.js";

const REQUIRED_KERNEL_FILES = [
  "domain.manifest.lock.json",
  "capability-map.json",
  "kernel/generated-types.ts",
  "kernel/permission-matrix.generated.ts",
  "kernel/process-contracts.generated.ts",
  "kernel/entity-contracts.generated.ts",
] as const;

export const buildGate: Gate = {
  id: "build",
  async run(ctx) {
    const findings: GateFinding[] = [];

    for (const relativePath of REQUIRED_KERNEL_FILES) {
      const path = join(ctx.domainDir, relativePath);
      if (!existsSync(path)) {
        findings.push(
          errorFinding("BUILD_ARTIFACT_MISSING", `Missing ${relativePath}.`, {
            file: relativePath,
          }),
        );
        continue;
      }

      if (relativePath.endsWith(".json")) {
        try {
          const parsed = JSON.parse(readUtf8(path)) as unknown;
          if (
            relativePath === "domain.manifest.lock.json" &&
            isRecord(parsed) &&
            parsed.manifestDigest !== ctx.compiled.manifestDigest
          ) {
            findings.push(
              errorFinding(
                "BUILD_LOCK_DIGEST_MISMATCH",
                "domain.manifest.lock.json manifestDigest does not match the compiled manifest.",
                { file: relativePath },
              ),
            );
          }
        } catch (error) {
          findings.push(
            errorFinding(
              "BUILD_JSON_PARSE",
              error instanceof Error ? error.message : String(error),
              { file: relativePath },
            ),
          );
        }
      } else {
        findings.push(
          ...parseTypeScriptSource(ctx.domainDir, path, readUtf8(path)),
        );
      }
    }

    for (const surface of ctx.surfaces) {
      if (surface.type === "standard") {
        continue;
      }
      const dir = surfaceDirectory(ctx.domainDir, surface);
      const files = listFilesRecursive(dir, sourceExtension);
      if (surface.entry && !existsSync(join(ctx.domainDir, surface.entry))) {
        findings.push(
          errorFinding(
            "BUILD_SURFACE_ENTRY_MISSING",
            `Surface "${surface.id}" entry file is missing.`,
            { file: surface.entry },
          ),
        );
        continue;
      }
      if (files.length === 0) {
        findings.push(
          errorFinding(
            "BUILD_SURFACE_FILES_MISSING",
            `Surface "${surface.id}" has no TypeScript source files to bundle.`,
          ),
        );
        continue;
      }
      const hash = sha256OfString(
        files
          .map((file) => `${relativeFile(ctx.domainDir, file)}\n${readUtf8(file)}`)
          .join("\n--- echothink-surface-file ---\n"),
      );
      findings.push(
        warningFinding(
          "BUILD_SURFACE_HASH",
          `Surface "${surface.id}" bundle hash ${hash} (${files.length} file${files.length === 1 ? "" : "s"}).`,
        ),
      );
    }

    if (composedOrCustomSurfaceFiles(ctx.domainDir).length === 0) {
      findings.push(
        warningFinding(
          "BUILD_NO_SURFACE_FILES",
          "No composed/custom surface files were present; kernel artifacts are the only build inputs.",
        ),
      );
    }

    return gateResult(this.id, findings);
  },
};

function parseTypeScriptSource(
  domainDir: string,
  path: string,
  sourceText: string,
): GateFinding[] {
  const result = ts.transpileModule(sourceText, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  return (result.diagnostics ?? []).map((diagnostic) => {
    const sourceFile = diagnostic.file;
    const position =
      sourceFile && diagnostic.start !== undefined
        ? sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined;
    return errorFinding(
      `BUILD_TS_PARSE_${diagnostic.code}`,
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      {
        file: relativeFile(domainDir, path),
        ...(position ? { line: position.line + 1 } : {}),
      },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
