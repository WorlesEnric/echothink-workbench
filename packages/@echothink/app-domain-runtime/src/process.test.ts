import { describe, expect, it } from "vitest";

import {
  createRuntimeHarness,
  sdkRequest,
} from "./test-support.js";

describe("UnitProcessEngine through DomainRuntime", () => {
  it("runs issue.triage transactionally, transitions state, emits, and audits reason", async () => {
    const { runtime, store, audit } = createRuntimeHarness({
      role: "triage_lead",
    });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "high",
        labels: ["bug", "support"],
        reason: "Needs priority triage",
      }),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    expect(response.data).toMatchObject({
      transitions: [
        {
          entity: "Issue",
          id: "issue-1",
          field: "state",
          from: "open",
          to: "triaged",
        },
      ],
      emitted: [
        expect.objectContaining({
          type: "issue.triaged",
          payload: {
            issueId: "issue-1",
            priority: "high",
            actorId: "actor-1",
          },
        }),
      ],
    });

    const updated = await store.get("Issue", "issue-1", { tenantId: "org_456" });
    expect(updated).toMatchObject({
      state: "triaged",
      priority: "high",
      labels: ["bug", "support"],
    });

    const processAudit = audit.records.find(
      (record) =>
        record.capability === "process.run" && record.target === "issue.triage",
    );
    expect(processAudit).toMatchObject({
      result: "ok",
      reason: "Needs priority triage",
    });
    expect(runtime.getEventBus().list?.()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "issue.triaged" }),
      ]),
    );
  });

  it("fails a closed issue on precondition before writing", async () => {
    const { runtime, store } = createRuntimeHarness({ role: "triage_lead" });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-2",
        priority: "high",
        labels: ["bug"],
        reason: "Try closed issue",
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    });
    await expect(store.get("Issue", "issue-2", { tenantId: "org_456" })).resolves
      .toMatchObject({ state: "closed" });
  });

  it("requires reason when process audit says reasonRequired", async () => {
    const { runtime } = createRuntimeHarness({ role: "triage_lead" });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "high",
        labels: ["bug"],
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    });
  });

  it("denies issue.triage for a viewer", async () => {
    const { runtime } = createRuntimeHarness({ role: "viewer" });

    const response = await runtime.call(
      sdkRequest("process.run", "issue.triage", {
        issueId: "issue-1",
        priority: "high",
        labels: ["bug"],
        reason: "Viewer should not triage",
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "permission_denied" },
    });
  });
});
