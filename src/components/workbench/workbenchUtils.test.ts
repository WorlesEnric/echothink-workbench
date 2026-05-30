import { describe, expect, it } from "vitest";
import { extractManifestSummary, SURFACE_GATE_MATRIX } from "./workbenchUtils";

describe("workbenchUtils", () => {
  it("extracts surfaces and process ids from a domain manifest", () => {
    const summary = extractManifestSummary(`apiVersion: echothink.ai/v1
kind: AppDomain

unitProcesses:
  issue.assign:
    input:
      issueId: string
  issue.close:
    input:
      issueId: string

surfaces:
  - id: issues-admin
    type: standard
    route: /issues
    page: EntityTable
    query: issues.open
    requiredPermissions:
      - issue.read
      - issue.assign
  - id: triage-console
    type: composed
    route: "/triage"
    entry: surfaces/composed/triage-console/index.tsx
    allowedImports: ["@echothink-ui/data", "@echothink-ui/task"]

release:
  channel: candidate
`);

    expect(summary.processes).toEqual(["issue.assign", "issue.close"]);
    expect(summary.surfaces).toEqual([
      {
        id: "issues-admin",
        type: "standard",
        route: "/issues",
        page: "EntityTable",
        query: "issues.open",
        requiredPermissions: ["issue.read", "issue.assign"],
        allowedImports: [],
      },
      {
        id: "triage-console",
        type: "composed",
        route: "/triage",
        entry: "surfaces/composed/triage-console/index.tsx",
        requiredPermissions: [],
        allowedImports: ["@echothink-ui/data", "@echothink-ui/task"],
      },
    ]);
  });

  it("marks custom surface security-imports as required", () => {
    expect(SURFACE_GATE_MATRIX.custom["security-imports"]).toBe("required");
  });
});
