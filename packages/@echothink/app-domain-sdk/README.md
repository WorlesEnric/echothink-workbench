# @echothink/app-domain-sdk

Typed SDK for App-Domain generated surfaces. Generated UI imports this package
and approved UI libraries only; all domain reads, unit processes, events, audit
annotations, and effects are delegated to an injected `Transport`.

The SDK does not perform network, secret, database, or filesystem access. The
runtime and preview runtime implement `Transport`.

## React usage

```tsx
import { useProcess } from "@echothink/app-domain-sdk/react";
import type { GitHubTriageDomain } from "../kernel/generated-types";

export function TriageButton({ issueId }: { issueId: string }) {
  const triage = useProcess<GitHubTriageDomain, "issue.triage">("issue.triage");

  return (
    <button
      disabled={!triage.canRun}
      onClick={() =>
        triage.run({
          issueId,
          priority: "high",
          labels: ["needs-review"],
          reason: "Escalated by reviewer",
        })
      }
    >
      Triage
    </button>
  );
}
```

## Permission cache

`permissions.can()` and `processes.canRun()` are synchronous cache reads. Populate
the cache with `permissions.canAsync()`, `processes.canRunAsync()`, or
`refreshPermissions()` before relying on those synchronous values in non-React
code. The React hooks do this through TanStack Query and remain suspense-free.
