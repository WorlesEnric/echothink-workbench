import type { EffectImpl } from "@echothink/app-domain-sdk";
import { compileManifest } from "@echothink/domain-manifest";
import { describe, expect, it, vi } from "vitest";

import {
  cloneManifest,
  createRuntimeHarness,
  sdkRequest,
} from "./test-support.js";

describe("EffectInvoker through DomainRuntime", () => {
  it("invokes declared effects and redacts effect audit paths in process audit", async () => {
    const calls: unknown[] = [];
    const commentEffect: EffectImpl<unknown, unknown> = {
      id: "github.issue.comment",
      async invoke(input) {
        calls.push(input);
        return { commentId: "comment-1", url: "https://example.test/comment-1" };
      },
    };
    const { runtime, audit } = createRuntimeHarness({
      role: "reviewer",
      effects: [commentEffect],
    });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.comment", {
        issueId: "issue-1",
        body: "sensitive body",
      }),
    );

    expect(response.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      issueId: "issue-1",
      body: "sensitive body",
      repo: "dyad-sh/dyad",
      issueNumber: 1,
    });

    const processAudit = audit.records.find(
      (record) =>
        record.capability === "process.run" && record.target === "issue.comment",
    );
    expect(processAudit?.redactedInput).toMatchObject({
      input: {
        issueId: "issue-1",
        body: "[REDACTED]",
      },
    });
  });

  it("denies effects that are not declared", async () => {
    const { runtime } = createRuntimeHarness({
      role: "admin",
      effects: [],
    });

    const response = await runtime.call(
      sdkRequest("effect.invoke", "github.issue.delete", {
        issueId: "issue-1",
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "effect_denied" },
    });
  });

  it("denies declared effects in the wrong environment", async () => {
    const base = createRuntimeHarness({ role: "reviewer" }).compiled;
    const manifest = cloneManifest(base.manifest);
    const effect = manifest.effects["github.issue.comment"];
    if (!effect) {
      throw new Error("Missing github.issue.comment effect");
    }
    effect.environments = ["staging"];
    const compiled = compileManifest(manifest, { now: base.compiledAt });
    const commentEffect: EffectImpl<unknown, unknown> = {
      id: "github.issue.comment",
      invoke: vi.fn(async () => ({ commentId: "comment-1" })),
    };
    const { runtime, store } = createRuntimeHarness({
      role: "reviewer",
      compiled,
      effects: [commentEffect],
      env: "production",
    });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.comment", {
        issueId: "issue-1",
        body: "will be denied",
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "effect_denied" },
    });
    expect(commentEffect.invoke).not.toHaveBeenCalled();
    await expect(store.get("Issue", "issue-1", { tenantId: "org_456" })).resolves
      .toMatchObject({ state: "open" });
  });
});
