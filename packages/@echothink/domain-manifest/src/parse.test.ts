import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  AppDomainManifestSchema,
  type AppDomainManifest,
} from "./schema.js";
import { ManifestParseError, parseManifestYaml } from "./parse.js";
import {
  normalizeEntity,
  normalizeField,
  normalizeProcess,
} from "./normalizers.js";

const fixtureYaml = readFileSync(
  new URL("./__fixtures__/github-triage.manifest.yaml", import.meta.url),
  "utf8",
);

describe("parseManifestYaml", () => {
  it("parses the github-triage fixture", () => {
    const { manifest } = parseManifestYaml(fixtureYaml);

    expect(manifest.metadata.id).toBe("github-triage");
    expect(Object.keys(manifest.entities)).toEqual(["Issue"]);
    expect(Object.keys(manifest.unitProcesses)).toContain("issue.triage");
  });

  it("rejects malformed manifests with ManifestParseError", () => {
    expect(() => parseManifestYaml("apiVersion: wrong\nkind: AppDomain\n")).toThrow(
      ManifestParseError,
    );

    try {
      parseManifestYaml("apiVersion: wrong\nkind: AppDomain\n");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestParseError);
      expect((error as ManifestParseError).issues.length).toBeGreaterThan(0);
    }
  });

  it("round-trips every field shorthand form", () => {
    const manifest = parseManifestYaml(
      stringify(
        minimalManifest({
          text: "string",
          count: "number",
          enabled: "boolean",
          dueAt: "date",
          payload: "json",
          nullableText: "string?",
          labels: "string[]",
          scores: "number[]",
          objectText: { type: "string", optional: true },
          objectNullable: { type: "number?" },
          objectArray: { type: "number[]" },
          status: { enum: ["open", "closed"], optional: true },
          parent: { ref: "Issue", optional: true },
        }),
      ),
    ).manifest;
    const entity = manifest.entities.Issue;
    expect(entity).toBeDefined();

    const fields = normalizeEntity("Issue", entity).fields;
    expect(fields).toContainEqual({
      name: "text",
      kind: "string",
      optional: false,
    });
    expect(fields).toContainEqual({
      name: "nullableText",
      kind: "string",
      optional: true,
    });
    expect(fields).toContainEqual({
      name: "labels",
      kind: "string",
      optional: false,
      arrayOf: "string",
    });
    expect(fields).toContainEqual({
      name: "status",
      kind: "enum",
      optional: true,
      enumValues: ["open", "closed"],
    });
    expect(fields).toContainEqual({
      name: "parent",
      kind: "ref",
      optional: true,
      refEntity: "Issue",
    });
  });

  it("parses enum(...) IO shorthand", () => {
    const { manifest } = parseManifestYaml(fixtureYaml);
    const process = manifest.unitProcesses["issue.triage"];
    expect(process).toBeDefined();

    const priority = normalizeField("priority", process.input.priority);
    expect(priority).toEqual({
      name: "priority",
      kind: "enum",
      optional: false,
      enumValues: ["low", "medium", "high", "urgent"],
    });
  });

  it("parses both transition shapes", () => {
    const { manifest } = parseManifestYaml(fixtureYaml);
    const exactProcess = manifest.unitProcesses["issue.triage"];
    expect(exactProcess).toBeDefined();
    expect(normalizeProcess("issue.triage", exactProcess).transitions[0]).toMatchObject({
      kind: "exact",
      from: "open",
      to: "triaged",
    });

    const mapped = cloneManifest(manifest);
    const mappedProcess = mapped.unitProcesses["issue.triage"];
    if (!mappedProcess) {
      throw new Error("Missing issue.triage process");
    }
    mappedProcess.transitions = {
      "Issue.state": {
        approve: "triaged",
        reject: "closed",
      },
    };

    const reparsed = parseManifestYaml(stringify(mapped)).manifest;
    const reparsedProcess = reparsed.unitProcesses["issue.triage"];
    if (!reparsedProcess) {
      throw new Error("Missing reparsed issue.triage process");
    }
    expect(normalizeProcess("issue.triage", reparsedProcess).transitions[0]).toEqual({
      kind: "input-map",
      target: "Issue.state",
      entity: "Issue",
      field: "state",
      mapping: {
        approve: "triaged",
        reject: "closed",
      },
    });
  });
});

function minimalManifest(
  fields: AppDomainManifest["entities"][string]["schema"],
): AppDomainManifest {
  return AppDomainManifestSchema.parse({
    apiVersion: "echothink.ai/v1",
    kind: "AppDomain",
    metadata: {
      id: "field-spec-test",
      name: "Field Spec Test",
      owner: "test",
      version: "0.1.0",
      sdkContractVersion: "1.0",
      uiRegistryVersion: "2026.05",
    },
    identity: { roles: [{ id: "admin" }] },
    entities: {
      Issue: {
        key: "issue",
        tenantScope: "organization",
        schema: fields,
      },
    },
    queries: {},
    permissions: [],
    unitProcesses: {},
    events: {},
    effects: {},
    surfaces: [],
    release: { channel: "candidate", requiredApprovals: ["domain-owner"] },
  });
}

function cloneManifest(manifest: AppDomainManifest): AppDomainManifest {
  return AppDomainManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
}
