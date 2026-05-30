import type { CompiledManifest } from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import { literal } from "./utils.js";

export function generateGovernanceTests(
  compiled: CompiledManifest,
): GeneratedFile[] {
  return [
    {
      path: "tests/permissions.spec.ts",
      contents: renderPermissionsSpec(compiled),
    },
    {
      path: "tests/processes.spec.ts",
      contents: renderProcessesSpec(compiled),
    },
    {
      path: "tests/effects.spec.ts",
      contents: renderEffectsSpec(compiled),
    },
    {
      path: "tests/release.spec.ts",
      contents: renderReleaseSpec(compiled),
    },
  ];
}

function renderPermissionsSpec(compiled: CompiledManifest): string {
  return `${testHeader(["describe", "expect", "it"])}

${previewHelpers(compiled)}

describe("permissions governance", () => {
  it("allows and denies process permissions by persona role", () => {
    const { runtime } = createPreview("rob-reviewer");

    expect(runtime.explainPermission("process.run", "issue.triage").allowed).toBe(true);
    expect(runtime.explainPermission("process.run", "issue.assign").allowed).toBe(false);

    runtime.setPersona("vic-viewer");
    expect(runtime.explainPermission("entity.query", "issue.openQueue").allowed).toBe(true);
    expect(runtime.explainPermission("process.run", "issue.triage").allowed).toBe(false);
  });

  it("applies organization tenant scoping to preview fixtures", async () => {
    const { compiled, runtime } = createPreview("invalid-tenant");
    const response = await runtime.call(
      sdkRequest(compiled, "entity.query", "issue.openQueue", { limit: 10 }),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    expect(response.data).toEqual([]);
  });
});
`;
}

function renderProcessesSpec(compiled: CompiledManifest): string {
  return `${testHeader(["describe", "expect", "it"])}

${previewHelpers(compiled)}

describe("unit process governance", () => {
  it("transitions issue.triage, emits events, and writes audit records", async () => {
    const { compiled, runtime } = createPreview("rob-reviewer");
    const response = await runtime.call(
      sdkRequest(compiled, "process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "high",
        labels: ["bug", "support"],
        reason: "Needs priority triage",
      }),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    expect(response.data).toMatchObject({
      transitions: [
        {
          entity: "Issue",
          id: "issue-1",
          field: "state",
          from: "open",
          to: "triaged",
        },
      ],
      emitted: [
        expect.objectContaining({
          type: "issue.triaged",
          payload: {
            issueId: "issue-1",
            priority: "high",
            actorId: "rob-reviewer",
          },
        }),
      ],
    });
    expect(runtime.inspectEvents()).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "issue.triaged" })]),
    );
    expect(runtime.inspectAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "process.run",
          target: "issue.triage",
          result: "ok",
          reason: "Needs priority triage",
        }),
      ]),
    );
  });

  it("runs assignment only for a role with issue.assign", async () => {
    const { compiled, runtime } = createPreview("alice-admin");
    const response = await runtime.call(
      sdkRequest(compiled, "process.run", "issue.assign", {
        issueId: "issue-2",
        assignee: "triage-lead",
      }),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    expect(response.data).toMatchObject({
      transitions: [
        {
          entity: "Issue",
          id: "issue-2",
          field: "state",
          from: "triaged",
          to: "assigned",
        },
      ],
    });
  });
});
`;
}

function renderEffectsSpec(compiled: CompiledManifest): string {
  return `${testHeader(["describe", "expect", "it"])}

${previewHelpers(compiled)}

describe("effect governance", () => {
  it("invokes declared effect stubs and redacts audited input", async () => {
    const { compiled, runtime } = createPreview("rob-reviewer");
    const response = await runtime.call(
      sdkRequest(compiled, "process.run", "issue.comment", {
        issueId: "issue-1",
        body: "sensitive body",
      }),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    expect(response.data).toMatchObject({
      effects: {
        "github.issue.comment": {
          commentId: "stub-github-issue-comment-commentId",
          url: "https://example.test/github/issue/comment",
        },
      },
    });

    const processAudit = runtime.inspectAudit().find(
      (record) => record.capability === "process.run" && record.target === "issue.comment",
    );
    expect(JSON.stringify(processAudit?.redactedInput)).toContain("[REDACTED]");
    expect(JSON.stringify(processAudit?.redactedInput)).not.toContain("sensitive body");
  });

  it("denies effect-backed processes when the stub is unavailable", async () => {
    const compiled = loadCompiled();
    const runtime = createPreviewRuntime({
      compiled,
      fixtures: {
        personas: loadPersonas(),
        entities: loadEntities(),
        effectStubs: [],
      },
      activePersonaId: "rob-reviewer",
      clock: createClock(),
      ids: createIds(),
    });

    const response = await runtime.call(
      sdkRequest(compiled, "process.run", "issue.comment", {
        issueId: "issue-1",
        body: "will be denied",
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "effect_denied" },
    });
  });
});
`;
}

function renderReleaseSpec(compiled: CompiledManifest): string {
  return `import { DefaultReleaseGuard } from "@echothink/app-domain-runtime";
${testHeader(["describe", "expect", "it"], { includePreviewImport: false })}

${manifestHelpers(compiled)}

describe("release governance", () => {
  it("accepts a matching approved release manifest", () => {
    const compiled = loadCompiled();
    const guard = new DefaultReleaseGuard(compiled);
    const result = guard.verify(sdkRequest(compiled, "identity.current"), {
      manifestVersion: compiled.manifest.metadata.version,
      manifestDigest: compiled.manifestDigest,
      sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
      runtimeCompatibility: compiled.manifest.metadata.sdkContractVersion,
      promotionState: "approved",
      approved: true,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects stale or unapproved release evidence", () => {
    const compiled = loadCompiled();
    const guard = new DefaultReleaseGuard(compiled);
    const result = guard.verify(sdkRequest(compiled, "identity.current"), {
      manifestVersion: compiled.manifest.metadata.version,
      manifestDigest: "sha256:stale",
      sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
      promotionState: "draft",
      approved: false,
    });

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "Release manifest is explicitly unapproved.",
        "Release state draft is not approved for runtime use.",
        "Release manifestDigest does not match compiled manifest.",
      ]),
    );
  });
});
`;
}

function testHeader(
  vitestImports: readonly string[],
  opts: { includePreviewImport?: boolean } = {},
): string {
  const includePreviewImport = opts.includePreviewImport ?? true;
  const lines = [
    'import { readFileSync } from "node:fs";',
    'import { compileManifest, parseManifestYaml, type CompiledManifest } from "@echothink/domain-manifest";',
  ];
  if (includePreviewImport) {
    lines.push(
      'import { createPreviewRuntime } from "@echothink/app-domain-runtime/preview";',
    );
  }
  lines.push(`import { ${vitestImports.join(", ")} } from "vitest";`);
  return lines.join("\n");
}

function previewHelpers(compiled: CompiledManifest): string {
  return `${manifestHelpers(compiled)}

type PersonaFixture = {
  id: string;
  role: string;
  tenantId: string;
  label?: string;
  invalid?: boolean;
};

type EffectStub = {
  id: string;
  stub(input: unknown): Promise<unknown>;
};

function createPreview(activePersonaId: string) {
  const compiled = loadCompiled();
  return {
    compiled,
    runtime: createPreviewRuntime({
      compiled,
      fixtures: {
        personas: loadPersonas(),
        entities: loadEntities(),
        effectStubs: loadEffectStubs(),
      },
      activePersonaId,
      clock: createClock(),
      ids: createIds(),
    }),
  };
}

function loadPersonas(): PersonaFixture[] {
  const text = readFileSync(new URL("../fixtures/personas.yaml", import.meta.url), "utf8");
  const personas: PersonaFixture[] = [];
  let current: Partial<PersonaFixture> | undefined;
  for (const line of text.split("\\n")) {
    const start = /^  - id: (.+)$/.exec(line);
    if (start) {
      if (current?.id && current.role && current.tenantId) {
        personas.push(current as PersonaFixture);
      }
      current = { id: String(parseScalar(start[1] ?? "")) };
      continue;
    }
    const field = /^    ([A-Za-z]+): (.+)$/.exec(line);
    if (field && current) {
      const key = field[1] as keyof PersonaFixture;
      current[key] = parseScalar(field[2] ?? "") as never;
    }
  }
  if (current?.id && current.role && current.tenantId) {
    personas.push(current as PersonaFixture);
  }
  return personas;
}

function loadEntities(): Record<string, Record<string, unknown>[]> {
  return JSON.parse(
    readFileSync(new URL("../fixtures/sample-entities.json", import.meta.url), "utf8"),
  ) as Record<string, Record<string, unknown>[]>;
}

function loadEffectStubs(): EffectStub[] {
  const text = readFileSync(new URL("../fixtures/effect-stubs.yaml", import.meta.url), "utf8");
  const stubs: Array<{ id: string; output: Record<string, unknown> }> = [];
  let current: { id: string; output: Record<string, unknown> } | undefined;
  for (const line of text.split("\\n")) {
    const start = /^  - id: (.+)$/.exec(line);
    if (start) {
      if (current) {
        stubs.push(current);
      }
      current = { id: String(parseScalar(start[1] ?? "")), output: {} };
      continue;
    }
    const outputField = /^      ([A-Za-z0-9_]+): (.+)$/.exec(line);
    if (outputField && current) {
      current.output[outputField[1] ?? "value"] = parseScalar(outputField[2] ?? "");
    }
  }
  if (current) {
    stubs.push(current);
  }
  return stubs.map((stub) => ({
    id: stub.id,
    async stub() {
      return { ...stub.output };
    },
  }));
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\\d+(?:\\.\\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith("\\"") && value.endsWith("\\"")) ||
    value.startsWith("[") ||
    value.startsWith("{")
  ) {
    return JSON.parse(value);
  }
  return value;
}
`;
}

function manifestHelpers(compiled: CompiledManifest): string {
  return `const NOW = ${literal(compiled.compiledAt)};

function loadCompiled(): CompiledManifest {
  const manifestYaml = readFileSync(new URL("../domain.manifest.yaml", import.meta.url), "utf8");
  return compileManifest(parseManifestYaml(manifestYaml).manifest, {
    now: NOW,
  });
}

function sdkRequest(
  compiled: CompiledManifest,
  capability: "identity.current" | "permissions.can" | "entity.query" | "entity.get" | "process.run" | "event.subscribe" | "audit.annotate" | "effect.invoke",
  target?: string,
  input?: unknown,
) {
  return {
    domainId: compiled.manifest.metadata.id,
    manifestVersion: compiled.manifest.metadata.version,
    surfaceId: "triage-console",
    actorId: "rob-reviewer",
    tenantId: "org_456",
    capability,
    ...(target ? { target } : {}),
    ...(input !== undefined ? { input } : {}),
  };
}

function createClock() {
  return { now: () => NOW };
}

function createIds() {
  let next = 0;
  return {
    next(prefix = "id") {
      next += 1;
      return \`\${prefix}_\${next}\`;
    },
  };
}
`;
}
