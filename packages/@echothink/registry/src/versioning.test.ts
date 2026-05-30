import { describe, expect, it } from "vitest";
import { formatCommitMessage, versionImpact } from "./commit-metadata.js";

describe("versionImpact", () => {
  it("maps change kinds to spec version impacts", () => {
    expect(versionImpact("standard-copy")).toBe("patch");
    expect(versionImpact("composed-release")).toBe("minor");
    expect(versionImpact("new-effect")).toBe("minor+security");
    expect(versionImpact("new-dependency")).toBe("minor+security");
    expect(versionImpact("process-mutation")).toBe("major");
    expect(versionImpact("state-transition")).toBe("major");
  });
});

describe("formatCommitMessage", () => {
  it("formats the workbench commit metadata block", () => {
    expect(
      formatCommitMessage({
        domainId: "github-triage",
        runId: "run_2026_05_29_001",
        agent: "codex-patch-agent",
        manifestDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        validation: "pending",
        surfaceType: "composed",
      }),
    ).toBe(
      [
        "Domain: github-triage",
        "Workbench Run: run_2026_05_29_001",
        "Agent: codex-patch-agent",
        "Manifest Digest: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "Validation: pending",
        "Surface Type: composed",
      ].join("\n"),
    );
  });
});
