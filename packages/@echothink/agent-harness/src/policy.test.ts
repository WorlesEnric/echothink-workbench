import { describe, expect, it } from "vitest";

import {
  assertPatchWithinScope,
  defaultDomainPolicy,
  isCommandAllowed,
  isWriteAllowed,
} from "./policy.js";

describe("defaultDomainPolicy", () => {
  const policy = defaultDomainPolicy("/tmp/domain");

  it("denies generated, release, validation, and platform-owned writes", () => {
    expect(isWriteAllowed(policy, "kernel/generated-types.ts")).toBe(false);
    expect(isWriteAllowed(policy, "surfaces/composed/x/view.generated.ts")).toBe(
      false,
    );
    expect(isWriteAllowed(policy, "release.manifest.json")).toBe(false);
    expect(isWriteAllowed(policy, "validation/run.json")).toBe(false);
    expect(isWriteAllowed(policy, "packages/@echothink/validation/src/index.ts"))
      .toBe(false);
  });

  it("allows domain-authored surface, fixture, docs, and manifest files", () => {
    expect(isWriteAllowed(policy, "surfaces/composed/x/index.tsx")).toBe(true);
    expect(isWriteAllowed(policy, "fixtures/sample-entities.json")).toBe(true);
    expect(isWriteAllowed(policy, "docs/domain-brief.md")).toBe(true);
    expect(isWriteAllowed(policy, "domain.manifest.yaml")).toBe(true);
  });

  it("matches commands by allowed prefix and boundary", () => {
    expect(isCommandAllowed(policy, "npx vitest run")).toBe(true);
    expect(isCommandAllowed(policy, "npx vitest run src/policy.test.ts")).toBe(
      true,
    );
    expect(isCommandAllowed(policy, "npx vitest runaway")).toBe(false);
    expect(isCommandAllowed(policy, "rm -rf /")).toBe(false);
    expect(isCommandAllowed(policy, "curl https://example.com")).toBe(false);
    expect(isCommandAllowed(policy, "pnpm test && rm -rf /")).toBe(false);
  });

  it("flags out-of-scope patch paths", () => {
    const result = assertPatchWithinScope(policy, [
      "surfaces/composed/x/index.tsx",
      "kernel/generated-types.ts",
    ]);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["kernel/generated-types.ts"]);
  });
});
