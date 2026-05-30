import { describe, expect, it } from "vitest";

import { ManifestPermissionEngine } from "./engines/permissions.js";
import { compileGithubTriage } from "./test-support.js";

describe("PermissionEngine", () => {
  it("evaluates github-triage permission matrix rows by actor role", () => {
    const compiled = compileGithubTriage();
    const engine = new ManifestPermissionEngine(compiled.permissionMatrix);

    expect(engine.can(["viewer"], "entity.query", "issue.openQueue").allowed).toBe(
      true,
    );
    expect(engine.can(["viewer"], "process.run", "issue.triage").allowed).toBe(
      false,
    );
    expect(
      engine.can(["triage_lead"], "entity.query", "issue.openQueue").allowed,
    ).toBe(true);
    expect(
      engine.can(["triage_lead"], "process.run", "issue.triage").allowed,
    ).toBe(true);
    expect(engine.can(["admin"], "process.run", "issue.assign").allowed).toBe(
      true,
    );
    expect(engine.can(["reviewer"], "process.run", "issue.assign").allowed).toBe(
      false,
    );
  });
});
