import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { SurfaceRegistration } from "@echothink/domain-manifest";
import type { SurfaceType } from "@echothink/shared-types";
import type { GateFinding, GateId, GateResult } from "../types.js";

export function gateResult(
  gate: GateId,
  findings: GateFinding[],
  status?: GateResult["status"],
): GateResult {
  return {
    gate,
    status:
      status ??
      (findings.some((finding) => finding.severity === "error")
        ? "fail"
        : "pass"),
    findings,
    durationMs: 0,
  };
}

export function skipResult(
  gate: GateId,
  message: string,
  code = "GATE_SKIPPED",
): GateResult {
  return gateResult(
    gate,
    [{ severity: "warning", code, message }],
    "skip",
  );
}

export function errorFinding(
  code: string,
  message: string,
  opts: { file?: string; line?: number } = {},
): GateFinding {
  return {
    severity: "error",
    code,
    message,
    ...(opts.file ? { file: opts.file } : {}),
    ...(opts.line !== undefined ? { line: opts.line } : {}),
  };
}

export function warningFinding(
  code: string,
  message: string,
  opts: { file?: string; line?: number } = {},
): GateFinding {
  return {
    severity: "warning",
    code,
    message,
    ...(opts.file ? { file: opts.file } : {}),
    ...(opts.line !== undefined ? { line: opts.line } : {}),
  };
}

export function exceptionResult(gate: GateId, error: unknown): GateResult {
  return gateResult(
    gate,
    [
      errorFinding(
        "GATE_EXCEPTION",
        error instanceof Error ? error.message : String(error),
      ),
    ],
    "fail",
  );
}

export function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

export function listFilesRecursive(
  root: string,
  predicate: (path: string) => boolean,
): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (stat.isFile() && predicate(path)) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

export function sourceExtension(path: string): boolean {
  const extension = extname(path);
  return extension === ".ts" || extension === ".tsx";
}

export function isSurfaceSourceFile(path: string): boolean {
  if (!sourceExtension(path)) {
    return false;
  }
  const normalized = normalizePath(path);
  const segments = normalized.split("/");
  if (segments.includes("__tests__") || segments.includes("__mocks__")) {
    return false;
  }
  const fileName = segments[segments.length - 1] ?? "";
  return !(
    /\.(test|spec)\.tsx?$/.test(fileName) ||
    fileName === "stories.ts" ||
    fileName === "stories.tsx" ||
    /\.stories\.tsx?$/.test(fileName)
  );
}

export function relativeFile(domainDir: string, path: string): string {
  const rel = relative(domainDir, path);
  return rel.length > 0 && !rel.startsWith("..") ? normalizePath(rel) : path;
}

export function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

export function composedOrCustomSurfaceFiles(domainDir: string): string[] {
  return [
    ...listFilesRecursive(join(domainDir, "surfaces", "composed"), isSurfaceSourceFile),
    ...listFilesRecursive(join(domainDir, "surfaces", "custom"), isSurfaceSourceFile),
  ];
}

export function generatedKernelFiles(domainDir: string): string[] {
  return listFilesRecursive(join(domainDir, "kernel"), sourceExtension);
}

export function resolveDomainPath(domainDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(domainDir, path);
}

export function surfaceEntryPath(
  domainDir: string,
  surface: SurfaceRegistration,
): string | undefined {
  if (!surface.entry) {
    return undefined;
  }
  return resolveDomainPath(domainDir, surface.entry);
}

export function surfaceDirectory(
  domainDir: string,
  surface: SurfaceRegistration,
): string {
  const entry = surfaceEntryPath(domainDir, surface);
  if (entry) {
    return dirname(entry);
  }
  return join(domainDir, "surfaces", surface.type, surface.id);
}

export function surfaceForFile(
  domainDir: string,
  surfaces: readonly SurfaceRegistration[],
  filePath: string,
): SurfaceRegistration | undefined {
  const normalizedFile = normalizePath(resolve(filePath));
  for (const surface of surfaces) {
    if (surface.type === "standard") {
      continue;
    }
    const dir = normalizePath(resolve(surfaceDirectory(domainDir, surface)));
    if (normalizedFile === dir || normalizedFile.startsWith(`${dir}/`)) {
      return surface;
    }
  }
  return undefined;
}

export function surfaceTypes(
  surfaces: readonly SurfaceRegistration[],
): SurfaceType[] {
  return [...new Set(surfaces.map((surface) => surface.type))].sort();
}

export function isRelativeImport(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  );
}

export function packageNameFor(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0] ?? specifier;
}

export function isImportAllowed(
  specifier: string,
  allowedImports: readonly string[],
): boolean {
  if (isRelativeImport(specifier)) {
    return true;
  }
  const packageName = packageNameFor(specifier);
  return allowedImports.some((allowed) => {
    if (allowed.endsWith("/*")) {
      return packageName.startsWith(allowed.slice(0, -1));
    }
    return (
      specifier === allowed ||
      specifier.startsWith(`${allowed}/`) ||
      packageName === allowed
    );
  });
}

export function hasError(findings: readonly GateFinding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}
