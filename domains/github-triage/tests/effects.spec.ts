import { readFileSync } from "node:fs";
import { compileManifest, parseManifestYaml, type CompiledManifest } from "@echothink/domain-manifest";
import { createPreviewRuntime } from "@echothink/app-domain-runtime/preview";
import { describe, expect, it } from "vitest";

const NOW = "2026-05-29T18:00:00.000Z";

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
      return `${prefix}_${next}`;
    },
  };
}


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
  for (const line of text.split("\n")) {
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
  for (const line of text.split("\n")) {
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
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    value.startsWith("[") ||
    value.startsWith("{")
  ) {
    return JSON.parse(value);
  }
  return value;
}


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
