import type {
  ApprovalRole,
  ChangeKind,
  GateId,
  PromotionState,
  SurfaceRegistration,
} from "@/ipc/types";

export type SurfaceType = SurfaceRegistration["type"];
export type GateApplicability = "required" | "conditional" | "skip";

export interface ManifestSurfaceSummary {
  id: string;
  type: SurfaceType;
  route: string;
  page?: string;
  query?: string;
  entry?: string;
  requiredPermissions: string[];
  allowedImports: string[];
  isolation?: SurfaceRegistration["isolation"];
}

export interface ManifestSummary {
  surfaces: ManifestSurfaceSummary[];
  processes: string[];
}

export const SURFACE_TYPES = ["standard", "composed", "custom"] as const;

export const GATE_IDS = [
  "manifest-schema",
  "manifest-semantic",
  "typescript",
  "build",
  "permission-simulation",
  "entity-contract",
  "process-contract",
  "security-imports",
  "dependency-allowlist",
  "effect-simulation",
  "storybook",
  "accessibility",
  "visual",
  "release-completeness",
] as const satisfies readonly GateId[];

export const SURFACE_GATE_MATRIX: Record<
  SurfaceType,
  Record<GateId, GateApplicability>
> = {
  standard: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "conditional",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "conditional",
    "dependency-allowlist": "conditional",
    "effect-simulation": "conditional",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
  composed: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "required",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "required",
    "dependency-allowlist": "required",
    "effect-simulation": "conditional",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
  custom: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "required",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "required",
    "dependency-allowlist": "required",
    "effect-simulation": "required",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
};

export const SURFACE_MODE_DETAILS: Record<
  SurfaceType,
  {
    lane: string;
    label: string;
    riskLabel: string;
    riskTone: "low" | "medium" | "high";
    summary: string;
    validationSummary: string[];
    promotionRequirement: string;
  }
> = {
  standard: {
    lane: "Standard",
    label: "Functional Prototype",
    riskLabel: "Low risk",
    riskTone: "low",
    summary:
      "Manifest-driven page templates for validating the kernel, permissions, entities, and workflows before presentation work.",
    validationSummary: [
      "Manifest schema and semantic validation",
      "Entity/query binding validation",
      "Permission simulation",
      "Generated TypeScript, build, Storybook, accessibility, and visual snapshot gates",
      "No custom dependency additions",
    ],
    promotionRequirement:
      "Domain-owner approval unless kernel, permissions, or effects changed.",
  },
  composed: {
    lane: "Composed",
    label: "Styled Surface",
    riskLabel: "Medium risk",
    riskTone: "medium",
    summary:
      "Echothink-UI composition with constrained React, SDK-only data access, import policy, and generated stories/tests.",
    validationSummary: [
      "All Standard gates",
      "Strict import graph and restricted API scan",
      "Dependency allowlist",
      "Playwright flows, visual regression, and error-boundary checks",
      "SDK-only data access verification",
    ],
    promotionRequirement:
      "Domain-owner and platform review; security review for new dependencies, effects, or realtime channels.",
  },
  custom: {
    lane: "Custom",
    label: "Free-Form Design",
    riskLabel: "High risk",
    riskTone: "high",
    summary:
      "Per-container custom React when Echothink-UI cannot express the experience, still isolated behind the SDK bridge.",
    validationSummary: [
      "All Composed gates",
      "Dependency license/security review",
      "Threat model, CSP, sandbox, and performance checks",
      "Manual UX and accessibility review",
      "Custom rollback plan",
    ],
    promotionRequirement:
      "Domain owner, platform architect, security reviewer, and release manager exception approval.",
  },
};

export const REQUIRED_APPROVALS: Record<ChangeKind, ApprovalRole[]> = {
  "standard-copy": ["domain-owner"],
  "entity-schema": ["domain-owner", "platform-architect"],
  permission: ["domain-owner", "platform-architect"],
  "process-mutation": ["domain-owner", "platform-architect"],
  "state-transition": ["domain-owner", "platform-architect"],
  "new-effect": ["security", "integration-owner", "platform-architect"],
  "new-dependency": ["platform-architect"],
  "composed-release": ["domain-owner", "platform-architect"],
  "custom-release": ["domain-owner", "platform-architect", "security"],
  "production-promotion": ["release-manager"],
  "emergency-rollback": ["release-manager"],
};

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  "standard-copy": "Standard copy/layout",
  "entity-schema": "Entity schema",
  permission: "Permission",
  "process-mutation": "Unit process mutation",
  "state-transition": "State transition",
  "new-effect": "New external effect",
  "new-dependency": "New dependency",
  "composed-release": "Composed Surface release",
  "custom-release": "Custom Surface release",
  "production-promotion": "Production promotion",
  "emergency-rollback": "Emergency rollback",
};

export const CHANGE_KINDS = Object.keys(
  CHANGE_KIND_LABELS,
) as readonly ChangeKind[];

export const PROMOTION_STATES = [
  "draft",
  "validated-draft",
  "release-candidate",
  "approved",
  "canary",
  "production",
  "deprecated",
  "rolled-back",
] as const satisfies readonly PromotionState[];

export const PROMOTION_TRANSITIONS: Record<
  PromotionState,
  readonly PromotionState[]
> = {
  draft: ["validated-draft"],
  "validated-draft": ["release-candidate"],
  "release-candidate": ["approved"],
  approved: ["canary", "rolled-back"],
  canary: ["production", "rolled-back"],
  production: ["deprecated", "rolled-back"],
  deprecated: [],
  "rolled-back": [],
};

export function extractManifestSummary(
  manifestYaml: string | null | undefined,
): ManifestSummary {
  if (!manifestYaml) {
    return { surfaces: [], processes: [] };
  }

  return {
    surfaces: extractSurfaces(manifestYaml),
    processes: extractTopLevelMapKeys(manifestYaml, "unitProcesses"),
  };
}

export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return "n/a";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "undefined";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function labelFromRecord(
  value: Record<string, unknown>,
  preferredKeys: readonly string[],
  fallback: string,
): string {
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return fallback;
}

export function isRequiredGate(
  gate: GateId,
  surfaceType: SurfaceType | undefined,
): boolean {
  if (!surfaceType) {
    return true;
  }
  return SURFACE_GATE_MATRIX[surfaceType][gate] === "required";
}

function extractSurfaces(manifestYaml: string): ManifestSurfaceSummary[] {
  const surfacesSection = getSectionLines(manifestYaml, "surfaces");
  const items = splitYamlListItems(surfacesSection);

  return items
    .map(parseSurfaceItem)
    .filter((surface): surface is ManifestSurfaceSummary => surface !== null);
}

function parseSurfaceItem(item: YamlListItem): ManifestSurfaceSummary | null {
  const fields = new Map<string, string>();
  const arrays = new Map<string, string[]>();
  let activeArrayKey: string | null = null;

  for (let index = 0; index < item.lines.length; index += 1) {
    const line =
      index === 0
        ? item.lines[index].replace(
            /^\s*-\s*/,
            `${" ".repeat(item.indent + 2)}`,
          )
        : item.lines[index];
    const keyMatch = line.match(/^(\s+)([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);

    if (keyMatch) {
      const indent = keyMatch[1].length;
      const key = keyMatch[2];
      const rawValue = keyMatch[3].trim();
      activeArrayKey = null;

      if (indent > item.indent + 4) {
        continue;
      }

      if (key === "requiredPermissions" || key === "allowedImports") {
        const inlineValues = parseInlineArray(rawValue);
        arrays.set(key, inlineValues);
        activeArrayKey = rawValue ? null : key;
        continue;
      }

      fields.set(key, stripQuotes(rawValue));
      continue;
    }

    if (activeArrayKey) {
      const arrayMatch = line.match(/^\s*-\s*(.+)$/);
      if (arrayMatch) {
        arrays.set(activeArrayKey, [
          ...(arrays.get(activeArrayKey) ?? []),
          stripQuotes(arrayMatch[1].trim()),
        ]);
      }
    }
  }

  const id = fields.get("id");
  if (!id) {
    return null;
  }

  const rawType = fields.get("type");
  const type = isSurfaceType(rawType) ? rawType : "standard";
  const rawIsolation = fields.get("isolation");
  const isolation = isIsolation(rawIsolation) ? rawIsolation : undefined;
  const page = fields.get("page");
  const query = fields.get("query");
  const entry = fields.get("entry");

  return {
    id,
    type,
    route: fields.get("route") ?? "",
    ...(page ? { page } : {}),
    ...(query ? { query } : {}),
    ...(entry ? { entry } : {}),
    ...(isolation ? { isolation } : {}),
    requiredPermissions: arrays.get("requiredPermissions") ?? [],
    allowedImports: arrays.get("allowedImports") ?? [],
  };
}

function extractTopLevelMapKeys(
  manifestYaml: string,
  sectionName: string,
): string[] {
  return getSectionLines(manifestYaml, sectionName)
    .map((line) => line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:$|#.*$)/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1]);
}

function getSectionLines(manifestYaml: string, sectionName: string): string[] {
  const lines = manifestYaml.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => line.trim() === `${sectionName}:`,
  );
  if (startIndex === -1) {
    return [];
  }

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (
      trimmed &&
      !line.startsWith(" ") &&
      /^[A-Za-z][A-Za-z0-9_-]*:/.test(line)
    ) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines;
}

interface YamlListItem {
  indent: number;
  lines: string[];
}

function splitYamlListItems(lines: string[]): YamlListItem[] {
  const items: YamlListItem[] = [];
  let current: YamlListItem | null = null;

  for (const line of lines) {
    const match = line.match(/^(\s*)-\s+/);
    if (match) {
      const indent = match[1].length;
      if (current === null || indent <= current.indent) {
        if (current) {
          items.push(current);
        }
        current = { indent, lines: [line] };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    items.push(current);
  }

  return items;
}

function parseInlineArray(value: string): string[] {
  if (!value) {
    return [];
  }
  if (!value.startsWith("[") || !value.endsWith("]")) {
    return [stripQuotes(value)];
  }
  const inner = value.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return inner
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  const trimmed = value.replace(/\s+#.*$/, "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isSurfaceType(value: string | undefined): value is SurfaceType {
  return value === "standard" || value === "composed" || value === "custom";
}

function isIsolation(
  value: string | undefined,
): value is NonNullable<SurfaceRegistration["isolation"]> {
  return value === "none" || value === "iframe" || value === "worker";
}
