import { describe, expect, it } from "vitest";

import type {
  DomainDescriptor,
  EffectInput,
  EffectKey,
  EffectOutput,
  EntityKey,
  EntityShape,
  EventKey,
  EventPayload,
  PermKey,
  ProcessInput,
  ProcessKey,
  ProcessResult,
  QueryArgs,
  QueryKey,
  QueryRow,
} from "./index.js";

interface Issue extends Record<string, unknown> {
  id: string;
  title: string;
  priority: "low" | "high";
}

interface SampleDomain extends DomainDescriptor {
  id: "github-triage";
  entities: {
    Issue: Issue;
  };
  queries: {
    "issue.openQueue": {
      args: { repo: string; priority?: "low" | "high" };
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

const entityKey: EntityKey<SampleDomain> = "Issue";
const entityShape: EntityShape<SampleDomain, "Issue"> = {
  id: "1",
  title: "Bug",
  priority: "high",
};
const queryKey: QueryKey<SampleDomain> = "issue.openQueue";
const queryArgs: QueryArgs<SampleDomain, "issue.openQueue"> = {
  repo: "dyad-sh/dyad",
};
const queryRow: QueryRow<SampleDomain, "issue.openQueue"> = entityShape;
const processKey: ProcessKey<SampleDomain> = "issue.triage";
const processInput: ProcessInput<SampleDomain, "issue.triage"> = {
  issueId: "1",
  priority: "high",
};
const processResult: ProcessResult<SampleDomain, "issue.triage"> = {
  status: "triaged",
};
const eventKey: EventKey<SampleDomain> = "issue.triaged";
const eventPayload: EventPayload<SampleDomain, "issue.triaged"> = {
  issueId: "1",
  actorId: "u_123",
};
const effectKey: EffectKey<SampleDomain> = "github.issue.comment";
const effectInput: EffectInput<SampleDomain, "github.issue.comment"> = {
  issueId: "1",
  body: "Needs review",
};
const effectOutput: EffectOutput<SampleDomain, "github.issue.comment"> = {
  commentId: "c_1",
};
const permissionKey: PermKey<SampleDomain> = "issue.triage";

// @ts-expect-error bogus process keys must not typecheck.
const bogusProcessKey: ProcessKey<SampleDomain> = "issue.deleteAll";

describe("descriptor helper types", () => {
  it("keeps compile-time descriptor assertions in the test suite", () => {
    expect({
      entityKey,
      queryKey,
      processKey,
      eventKey,
      effectKey,
      permissionKey,
      queryArgs,
      queryRow,
      processInput,
      processResult,
      eventPayload,
      effectInput,
      effectOutput,
      bogusProcessKey,
    }).toBeTruthy();
  });
});
