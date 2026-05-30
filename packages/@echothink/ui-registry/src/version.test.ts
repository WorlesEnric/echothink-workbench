import { describe, expect, it } from "vitest";

import { uiRegistryVersion } from "./registry.js";

describe("ui registry version", () => {
  it("matches the github-triage fixture metadata", () => {
    expect(uiRegistryVersion).toBe("2026.05");
  });
});
