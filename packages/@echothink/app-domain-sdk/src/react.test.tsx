import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createAppDomainClient,
  type DomainDescriptor,
  type IdentityContext,
  type SdkRequest,
  type Transport,
} from "./index.js";
import {
  AppDomainProvider,
  useEntityQuery,
  useProcess,
} from "./react/index.js";

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

describe("React bindings", () => {
  it("runs processes and returns entity query rows", async () => {
    const calls: SdkRequest[] = [];
    const transport: Transport = {
      async call(req) {
        calls.push(req);
        if (req.capability === "entity.query") {
          return {
            ok: true,
            data: [
              { id: "1", title: "First issue", priority: "high" },
              { id: "2", title: "Second issue", priority: "low" },
            ],
          };
        }
        if (req.capability === "process.run") {
          return { ok: true, data: { status: "triaged" } };
        }
        if (req.capability === "permissions.can") {
          return { ok: true, data: true };
        }
        return { ok: true, data: undefined };
      },
    };
    const client = createAppDomainClient<TestDomain>({
      transport,
      descriptor: { id: "github-triage", manifestVersion: "0.4.0" },
      surfaceId: "triage-console",
      identity,
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppDomainProvider client={client}>
          <Harness />
        </AppDomainProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rows").textContent).toBe(
        "First issue,Second issue",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Run triage" }));

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capability: "process.run",
            target: "issue.triage",
            input: {
              issueId: "1",
              priority: "high",
              reason: "Escalated by reviewer",
            },
          }),
        ]),
      );
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "entity.query",
          target: "issue.openQueue",
          input: { repo: "dyad-sh/dyad" },
        }),
      ]),
    );
  });
});

function Harness() {
  const triage = useProcess<TestDomain, "issue.triage">("issue.triage");
  const query = useEntityQuery<TestDomain, "issue.openQueue">(
    "issue.openQueue",
    { repo: "dyad-sh/dyad" },
  );

  return (
    <>
      <div data-testid="rows">
        {query.data?.map((issue) => issue.title).join(",") ?? "loading"}
      </div>
      <button
        type="button"
        onClick={() => {
          void triage.run({
            issueId: "1",
            priority: "high",
            reason: "Escalated by reviewer",
          });
        }}
      >
        Run triage
      </button>
    </>
  );
}
