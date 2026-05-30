# @echothink/app-domain-runtime

Production and preview runtime authority for Echothink App Domains.

Generated UI code talks to domain state only through `@echothink/app-domain-sdk`.
This package implements the SDK `Transport` boundary and enforces release checks,
permissions, tenant scoping, input validation, legal state transitions, declared
effects, events, and audit records.

## Production runtime

```ts
import { createRuntime } from "@echothink/app-domain-runtime";

const runtime = createRuntime({
  compiled,
  release,
  entityStore,
  auditSink,
  secretResolver,
  effects: [githubIssueCommentEffect],
  clock,
  ids,
  env: "production",
  roleMap: {
    "user-1": { role: "triage_lead", tenantId: "org_456" },
  },
});

const response = await runtime.call({
  domainId: "github-triage",
  manifestVersion: "0.4.0",
  surfaceId: "triage-console",
  surfaceDigest: "sha256:...",
  actorId: "user-1",
  tenantId: "org_456",
  capability: "process.run",
  target: "issue.triage",
  input: {
    issueId: "issue-1",
    priority: "high",
    labels: ["bug"],
    reason: "Customer escalation",
  },
});
```

`call()` never throws across the transport boundary. It returns an SDK response:
`{ ok: true, data }` or `{ ok: false, error }`.

For production identity, inject `identityResolver`. The default resolver is useful
for tests and local harnesses: it derives roles from `roleMap`, explicit personas,
or manifest personas.

## Preview runtime

```ts
import { createPreviewRuntime } from "@echothink/app-domain-runtime/preview";

const preview = createPreviewRuntime({
  compiled,
  fixtures: {
    personas: [{ id: "lead", role: "triage_lead", tenantId: "org_456" }],
    entities: { Issue: issueFixtures },
    effectStubs: [githubIssueCommentStub],
  },
  activePersonaId: "lead",
  clock,
  ids,
});

preview.setPersona("lead");
preview.explainPermission("process.run", "issue.triage");
preview.forceFailure("permission");
preview.inspectAudit();
preview.inspectEvents();
preview.reset();
```

Preview uses the same runtime checks as production, but with in-memory entities,
audit, events, dummy secrets, and deterministic `EffectStub` wrappers. It performs
no raw network or WebSocket IO.
