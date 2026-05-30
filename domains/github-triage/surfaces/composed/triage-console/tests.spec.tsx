import { describe, expect, it } from "vitest";

import * as surfaceModule from "./index";

describe("github-triage/triage-console", () => {
  it("exports the composed surface component", () => {
    expect(typeof surfaceModule.TriageConsoleSurface).toBe("function");
  });
});
