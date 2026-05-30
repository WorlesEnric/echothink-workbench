import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AppDomainManifestSchema,
  compileManifest,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { permissionSimulationGate } from "./gates/permission-simulation.js";
import type { GateContext } from "./types.js";

const NOW = "2026-05-29T12:00:00.000Z";
const manifestYaml = readFileSync(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
  "utf8",
);

describe("permissionSimulationGate", () => {
  it("passes for the github-triage permission matrix", async () => {
    const compiled = compileManifest(parseManifestYaml(manifestYaml).manifest, {
      now: NOW,
    });
    const result = await permissionSimulationGate.run(context(compiled));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails when the compiled matrix grants viewer issue.triage", async () => {
    const compiled = compileManifest(parseManifestYaml(manifestYaml).manifest, {
      now: NOW,
    });
    const mutated = {
      ...compiled,
      manifest: AppDomainManifestSchema.parse(
        JSON.parse(JSON.stringify(compiled.manifest)) as unknown,
      ),
      permissionMatrix: compiled.permissionMatrix.map((row) =>
        row.role === "viewer" &&
        row.capability === "process.run" &&
        row.target === "issue.triage"
          ? { ...row, allowed: true }
          : row,
      ),
    };

    const result = await permissionSimulationGate.run(context(mutated));
    expect(result.status).toBe("fail");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PERMISSION_PROCESS_MISMATCH",
          severity: "error",
        }),
      ]),
    );
  });
});

function context(
  compiled: ReturnType<typeof compileManifest>,
): GateContext {
  return {
    domainDir: new URL("../../../../domains/github-triage", import.meta.url)
      .pathname,
    compiled,
    surfaces: compiled.surfaceRegistrations,
    runId: "permission-test",
    now: NOW,
  };
}
