# GitHub Triage Process Map

## Issue

```mermaid
stateDiagram-v2
  [*] --> open
  open --> triaged : issue.triage
  triaged --> assigned : issue.assign
  assigned --> closed
```

## Unit Processes

- `issue.triage`: Issue -> Issue; emits issue.triaged
- `issue.assign`: Issue -> Issue; emits issue.assigned
- `issue.comment`: Issue -> no writes; emits none
