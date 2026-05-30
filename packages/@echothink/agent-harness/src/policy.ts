import { posix } from "node:path";

export interface FileScopePolicy {
  allowWriteGlobs: string[];
  denyWriteGlobs: string[];
  platformOwnedGlobs: string[];
}

export interface CommandPolicy {
  allow: string[];
}

export interface HarnessPolicy {
  fileScope: FileScopePolicy;
  commands: CommandPolicy;
  network: "disabled" | "proxy";
  allowNewDependencies: boolean;
}

export const DEFAULT_COMMAND_ALLOWLIST = [
  "pnpm typecheck",
  "pnpm test",
  "pnpm build",
  "npm run typecheck",
  "npm test",
  "echothink-validate",
  "npx vitest run",
  "npx tsc",
] as const;

export function defaultDomainPolicy(domainDir: string): HarnessPolicy {
  if (domainDir.trim().length === 0) {
    throw new Error("defaultDomainPolicy requires a non-empty domainDir.");
  }

  return {
    fileScope: {
      allowWriteGlobs: [
        "surfaces/**",
        "fixtures/**",
        "docs/**",
        "domain.manifest.yaml",
      ],
      denyWriteGlobs: [
        "kernel/**",
        "**/*.generated.*",
        "release.manifest.json",
        "validation/**",
      ],
      platformOwnedGlobs: ["packages/@echothink/**"],
    },
    commands: {
      allow: [...DEFAULT_COMMAND_ALLOWLIST],
    },
    network: "disabled",
    allowNewDependencies: false,
  };
}

export function isWriteAllowed(
  policy: HarnessPolicy,
  relPath: string,
): boolean {
  const normalizedPath = normalizeRelativePath(relPath);
  if (!normalizedPath) return false;

  const denied = [
    ...policy.fileScope.denyWriteGlobs,
    ...policy.fileScope.platformOwnedGlobs,
  ].some((glob) => matchesGlob(glob, normalizedPath));
  if (denied) return false;

  return policy.fileScope.allowWriteGlobs.some((glob) =>
    matchesGlob(glob, normalizedPath),
  );
}

export function isCommandAllowed(
  policy: HarnessPolicy,
  cmd: string,
): boolean {
  const normalizedCommand = normalizeCommand(cmd);
  if (!normalizedCommand || hasShellControlOperator(normalizedCommand)) {
    return false;
  }

  return policy.commands.allow.some((allowed) =>
    commandStartsWithAllowed(normalizedCommand, normalizeCommand(allowed)),
  );
}

export function assertPatchWithinScope(
  policy: HarnessPolicy,
  changedPaths: string[],
): { ok: boolean; violations: string[] } {
  const violations = changedPaths.filter((changedPath) =>
    !isWriteAllowed(policy, changedPath),
  );
  return {
    ok: violations.length === 0,
    violations,
  };
}

export function normalizeRelativePath(relPath: string): string | null {
  const unified = relPath.replace(/\\/gu, "/");
  if (
    unified.length === 0 ||
    unified.startsWith("/") ||
    /^[A-Za-z]:\//u.test(unified)
  ) {
    return null;
  }

  const normalized = posix.normalize(unified);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return null;
  }

  return normalized;
}

function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/gu, " ");
}

function commandStartsWithAllowed(command: string, allowed: string): boolean {
  if (allowed.length === 0) return false;
  if (command === allowed) return true;
  if (!command.startsWith(allowed)) return false;

  const next = command.charAt(allowed.length);
  return /\s/u.test(next);
}

function hasShellControlOperator(command: string): boolean {
  return /(?:&&|\|\||;|\||`|\$\(|>|<)/u.test(command);
}

function matchesGlob(glob: string, relPath: string): boolean {
  const normalizedGlob = normalizeGlob(glob);
  if (!normalizedGlob) return false;

  return matchSegments(
    normalizedGlob.split("/"),
    relPath.split("/"),
    0,
    0,
  );
}

function normalizeGlob(glob: string): string | null {
  const unified = glob.replace(/\\/gu, "/");
  if (unified.length === 0 || unified.startsWith("/")) return null;
  const normalized = posix.normalize(unified);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return null;
  }
  return normalized;
}

function matchSegments(
  patternSegments: string[],
  pathSegments: string[],
  patternIndex: number,
  pathIndex: number,
): boolean {
  if (patternIndex === patternSegments.length) {
    return pathIndex === pathSegments.length;
  }

  const segment = patternSegments[patternIndex];
  if (segment === undefined) return false;

  if (segment === "**") {
    if (patternIndex === patternSegments.length - 1) {
      return true;
    }
    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (
        matchSegments(
          patternSegments,
          pathSegments,
          patternIndex + 1,
          nextPathIndex,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  const pathSegment = pathSegments[pathIndex];
  if (pathSegment === undefined) return false;
  if (!matchSegment(segment, pathSegment)) return false;

  return matchSegments(
    patternSegments,
    pathSegments,
    patternIndex + 1,
    pathIndex + 1,
  );
}

function matchSegment(pattern: string, segment: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  const source = escaped.replace(/\*/gu, "[^/]*").replace(/\?/gu, "[^/]");
  return new RegExp(`^${source}$`, "u").test(segment);
}
