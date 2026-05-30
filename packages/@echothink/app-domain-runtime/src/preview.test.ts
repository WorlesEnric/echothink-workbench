import { describe, expect, it, vi } from "vitest";

import { createPreviewRuntime } from "./preview/index.js";
import {
  compileGithubTriage,
  createClock,
  createIds,
  createIssues,
  sdkRequest,
} from "./test-support.js";

describe("createPreviewRuntime", () => {
  it("switches personas, explains permissions, supports failure injection, and stays in-memory", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("preview runtime must not fetch");
    });
    const originalWebSocket = Object.getOwnPropertyDescriptor(
      globalThis,
      "WebSocket",
    );
    const webSocketSpy = vi.fn();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: webSocketSpy,
    });

    const runtime = createPreviewRuntime({
      compiled: compileGithubTriage(),
      fixtures: {
        personas: [
          { id: "viewer", role: "viewer", tenantId: "org_456" },
          { id: "lead", role: "triage_lead", tenantId: "org_456" },
          {
            id: "invalid",
            role: "reviewer",
            tenantId: "org_missing",
            invalid: true,
          },
        ],
        entities: { Issue: createIssues() },
        effectStubs: [],
      },
      activePersonaId: "viewer",
      clock: createClock(),
      ids: createIds(),
    });

    expect(
      runtime.explainPermission("process.run", "issue.triage").allowed,
    ).toBe(false);
    runtime.setPersona("lead");
    expect(
      runtime.explainPermission("process.run", "issue.triage").allowed,
    ).toBe(true);

    const response = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "urgent",
        labels: ["incident"],
        reason: "Preview triage",
      }),
    );
    expect(response.ok).toBe(true);
    expect(runtime.inspectAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "process.run",
          target: "issue.triage",
          result: "ok",
        }),
      ]),
    );
    expect(runtime.inspectEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "issue.triaged" }),
      ]),
    );

    runtime.forceFailure("permission");
    const denied = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "high",
        labels: [],
        reason: "Forced",
      }),
    );
    expect(denied).toMatchObject({
      ok: false,
      error: { kind: "permission_denied" },
    });

    runtime.reset();
    expect(runtime.inspectAudit()).toEqual([]);
    expect(runtime.inspectEvents()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    if (originalWebSocket === undefined) {
      Reflect.deleteProperty(globalThis, "WebSocket");
    } else {
      Object.defineProperty(globalThis, "WebSocket", originalWebSocket);
    }
  });
});
