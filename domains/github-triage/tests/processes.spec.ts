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
