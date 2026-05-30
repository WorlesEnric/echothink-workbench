import { describe, expect, it, vi } from "vitest";

import {
  createAppDomainClient,
  SdkCallError,
  type DomainDescriptor,
  type IdentityContext,
  type SdkRequest,
  type SdkResponse,
  type Transport,
} from "./index.js";

interface Issue extends Record<string, unknown> {
  id: string;
  title: string;
  priority: "low" | "high";
}

interface TestDomain extends DomainDescriptor {
  id: "github-triage";
  entities: {
    Issue: Issue;
  };
  queries: {
    "issue.openQueue": {
      args: { repo: string };
      row: Issue;
    };
  };
  processes: {
    "issue.triage": {
      input: { issueId: string; priority: "low" | "high" };
      output: { status: "triaged" };
    };
  };
  events: {
    "issue.triaged": { issueId: string; actorId: string };
  };
  effects: {
    "github.issue.comment": {
      input: { issueId: string; body: string };
      output: { commentId: string };
    };
  };
  permissions: "issue.read" | "issue.triage";
}

const identity: IdentityContext = {
  actorId: "u_123",
  tenantId: "org_456",
  roles: ["triager"],
};

describe("createAppDomainClient", () => {
  it("builds the expected SdkRequest envelopes and never opens raw IO", async () => {
    const calls: SdkRequest[] = [];
    const unsubscribe = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch must not be called by the SDK");
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

    const transport: Transport = {
      async call(req) {
        calls.push(req);
        return responseFor(req, unsubscribe);
      },
    };
    const idempotency = vi.fn(() => "idem-1");
    const client = createAppDomainClient<TestDomain>({
      transport,
      descriptor: { id: "github-triage", manifestVersion: "0.4.0" },
      surfaceId: "triage-console",
      surfaceDigest: "sha256:surface",
      identity,
      idempotency,
    });

    expect(client.identity.current()).toEqual(identity);
    expect(
      client.permissions.can("issue.read", { entity: "Issue" }),
    ).toBe(false);
    await expect(client.permissions.canAsync("issue.triage")).resolves.toBe(
      true,
    );
    await expect(
      client.entities.query("issue.openQueue", { repo: "dyad-sh/dyad" }),
    ).resolves.toEqual([{ id: "1", title: "Bug", priority: "high" }]);
    await expect(client.entities.get("Issue", "1")).resolves.toEqual({
      id: "1",
      title: "Bug",
      priority: "high",
    });
    await expect(
      client.processes.run("issue.triage", {
        issueId: "1",
        priority: "high",
        reason: "Escalated by reviewer",
      }),
    ).resolves.toEqual({ status: "triaged" });
    const stop = client.events.subscribe("issue.triaged", () => undefined);
    await Promise.resolve();
    stop();
    await Promise.resolve();
    await expect(
      client.audit.annotate({
        target: "Issue:1",
        reason: "Reviewer note",
      }),
    ).resolves.toBeUndefined();
    await expect(
      client.effects.invoke("github.issue.comment", {
        issueId: "1",
        body: "Needs review",
      }),
    ).resolves.toEqual({ commentId: "c_1" });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domainId: "github-triage",
          manifestVersion: "0.4.0",
          surfaceId: "triage-console",
          surfaceDigest: "sha256:surface",
          actorId: "u_123",
          tenantId: "org_456",
          capability: "identity.current",
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "permissions.can",
          target: "issue.read",
          input: { entity: "Issue" },
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "entity.query",
          target: "issue.openQueue",
          input: { repo: "dyad-sh/dyad" },
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "entity.get",
          target: "Issue",
          input: { id: "1" },
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "process.run",
          target: "issue.triage",
          input: {
            issueId: "1",
            priority: "high",
            reason: "Escalated by reviewer",
          },
          idempotencyKey: "idem-1",
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "event.subscribe",
          target: "issue.triaged",
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "audit.annotate",
          target: "Issue:1",
          input: { target: "Issue:1", reason: "Reviewer note" },
          idempotencyKey: "idem-1",
        }),
        expect.objectContaining({
          domainId: "github-triage",
          surfaceId: "triage-console",
          capability: "effect.invoke",
          target: "github.issue.comment",
          input: { issueId: "1", body: "Needs review" },
          idempotencyKey: "idem-1",
        }),
      ]),
    );
    expect(calls.find((req) => req.capability === "event.subscribe")?.input).toEqual(
      { callback: expect.any(Function) },
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(webSocketSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    if (originalWebSocket === undefined) {
      Reflect.deleteProperty(globalThis, "WebSocket");
    } else {
      Object.defineProperty(globalThis, "WebSocket", originalWebSocket);
    }
  });

  it("throws SdkCallError with the runtime error kind", async () => {
    const transport: Transport = {
      async call() {
        return {
          ok: false,
          error: {
            kind: "permission_denied",
            message: "No access",
            details: { permission: "issue.triage" },
          },
        };
      },
    };
    const client = createAppDomainClient<TestDomain>({
      transport,
      descriptor: { id: "github-triage", manifestVersion: "0.4.0" },
      surfaceId: "triage-console",
      identity,
    });

    await expect(
      client.processes.run("issue.triage", {
        issueId: "1",
        priority: "high",
      }),
    ).rejects.toMatchObject({
      name: "SdkCallError",
      kind: "permission_denied",
      details: { permission: "issue.triage" },
    });
    await expect(
      client.processes.run("issue.triage", {
        issueId: "1",
        priority: "high",
      }),
    ).rejects.toBeInstanceOf(SdkCallError);
  });
});

function responseFor(
  req: SdkRequest,
  unsubscribe: () => void,
): Promise<SdkResponse> {
  switch (req.capability) {
    case "identity.current":
      return Promise.resolve({ ok: true, data: identity });
    case "permissions.can":
      return Promise.resolve({ ok: true, data: req.target === "issue.triage" });
    case "entity.query":
      return Promise.resolve({
        ok: true,
        data: [{ id: "1", title: "Bug", priority: "high" }],
      });
    case "entity.get":
      return Promise.resolve({
        ok: true,
        data: { id: "1", title: "Bug", priority: "high" },
      });
    case "process.run":
      return Promise.resolve({ ok: true, data: { status: "triaged" } });
    case "event.subscribe":
      return Promise.resolve({ ok: true, data: { unsubscribe } });
    case "audit.annotate":
      return Promise.resolve({ ok: true, data: undefined });
    case "effect.invoke":
      return Promise.resolve({ ok: true, data: { commentId: "c_1" } });
  }
}
