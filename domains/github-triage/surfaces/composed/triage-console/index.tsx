import type { DomainDescriptor } from "@echothink/app-domain-sdk";
import { useAppDomain, useEntityQuery, useProcess } from "@echothink/app-domain-sdk/react";
import { Badge, Button, InlineNotification, Select, Tag, Textarea, TextInput } from "@echothink-ui/core";
import { DataTable } from "@echothink-ui/data";
import { AppPageLayout, PageHeader, WorkspaceShell } from "@echothink-ui/layouts";
import { TaskApprovalPanel } from "@echothink-ui/task";
import { useMemo, useState, type ReactElement } from "react";

interface GitHubTriageSurfaceDomain extends DomainDescriptor {
  id: "github-triage";
  entities: {
    Issue: {
      id: string;
      repo: string;
      title: string;
      state: "open" | "triaged" | "assigned" | "closed";
      labels: string[];
      assignee: string | null;
      priority: "low" | "medium" | "high" | "urgent";
      createdAt: string;
    };
  };
  queries: {
    "issue.openQueue": {
      args: Record<string, unknown>;
      row: GitHubTriageSurfaceDomain["entities"]["Issue"];
    };
  };
  processes: {
    "issue.triage": {
      input: {
        issueId: string;
        priority: "low" | "medium" | "high" | "urgent";
        labels: string[];
      };
      output: Record<string, unknown>;
    };
    "issue.assign": {
      input: {
        issueId: string;
        assignee: string;
      };
      output: Record<string, unknown>;
    };
    "issue.comment": {
      input: {
        issueId: string;
        body: string;
      };
      output: Record<string, unknown>;
    };
  };
  events: Record<string, Record<string, unknown>>;
  effects: Record<string, { input: Record<string, unknown>; output: unknown }>; 
  permissions: "issue.read" | "issue.triage" | "issue.assign" | "issue.comment";
}

type IssueRecord = GitHubTriageSurfaceDomain["entities"]["Issue"];

interface ProcessAction {
  id: "issue.assign" | "issue.comment" | "issue.triage";
  label: string;
  permission?: string;
  policyClass?: string;
  effectIds: string[];
  reasonRequired: boolean;
}

interface ProcessRunner {
  run(input: Record<string, unknown> & { reason?: string }): Promise<unknown>;
  canRun: boolean;
  isRunning: boolean;
}

const QUERY_ID = "issue.openQueue" as const;
const SURFACE_ID = "triage-console" as const;
const REQUIRED_PERMISSIONS = ["issue.read", "issue.triage"] as const;

const ISSUE_COLUMNS = [
  { key: "id", header: "Id" },
  { key: "repo", header: "Repo" },
  { key: "title", header: "Title" },
  { key: "state", header: "State" },
  { key: "labels", header: "Labels" },
  { key: "assignee", header: "Assignee" },
  { key: "priority", header: "Priority" },
  { key: "createdAt", header: "Created At" },
];

const PROCESS_ACTIONS: ProcessAction[] = [
  {
    id: "issue.assign",
    label: "Issue Assign",
    permission: "issue.assign",
    policyClass: "side_effect_low",
    effectIds: [],
    reasonRequired: false,
  },
  {
    id: "issue.comment",
    label: "Issue Comment",
    permission: "issue.comment",
    policyClass: "side_effect_high",
    effectIds: ["github.issue.comment"],
    reasonRequired: false,
  },
  {
    id: "issue.triage",
    label: "Issue Triage",
    permission: "issue.triage",
    policyClass: "side_effect_low",
    effectIds: [],
    reasonRequired: true,
  },
];

export function TriageConsoleSurface(): ReactElement {
  const domain = useAppDomain<GitHubTriageSurfaceDomain>();
  const identity = domain.identity.current();
  const issueOpenqueueQuery = useEntityQuery<GitHubTriageSurfaceDomain, typeof QUERY_ID>(
    QUERY_ID,
    { limit: 50 },
  );
  const issueAssignProcess = useProcess<GitHubTriageSurfaceDomain, "issue.assign">("issue.assign");
  const issueCommentProcess = useProcess<GitHubTriageSurfaceDomain, "issue.comment">("issue.comment");
  const issueTriageProcess = useProcess<GitHubTriageSurfaceDomain, "issue.triage">("issue.triage");
  const rows = issueOpenqueueQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [assignee, setAssignee] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [priority, setPriority] = useState("high");

  const selected = useMemo(() => {
    return rows.find((row) => row.id === selectedId) ?? rows[0];
  }, [rows, selectedId]);

  const processRunners: Record<ProcessAction["id"], ProcessRunner> = {
    "issue.assign": issueAssignProcess as unknown as ProcessRunner,
    "issue.comment": issueCommentProcess as unknown as ProcessRunner,
    "issue.triage": issueTriageProcess as unknown as ProcessRunner,
  };

  const visibleActions = PROCESS_ACTIONS.map((action) => ({
    ...action,
    canRun: processRunners[action.id]?.canRun ?? false,
    isRunning: processRunners[action.id]?.isRunning ?? false,
  }));

  const runAction = async (action: ProcessAction): Promise<void> => {
    if (!selected) {
      return;
    }
    const runner = processRunners[action.id];
    if (!runner?.canRun) {
      return;
    }
    await runner.run(buildProcessInput(action, selected, { assignee, commentBody, priority }));
    await issueOpenqueueQuery.refetch();
  };

  return (
    <WorkspaceShell surfaceId={SURFACE_ID} tenantId={identity.tenantId}>
      <AppPageLayout
        header={
          <PageHeader
            title="Triage Console"
            eyebrow="GitHub Triage"
            actions={
              <div className="eth-triage-console__topbar">
                {REQUIRED_PERMISSIONS.map((permission) => (
                  <Badge key={permission} tone={domain.permissions.can(permission) ? "positive" : "warning"}>
                    {permission}
                  </Badge>
                ))}
                <Badge tone={issueOpenqueueQuery.isLoading ? "neutral" : "positive"}>
                  {issueOpenqueueQuery.isLoading ? "Syncing" : "Synced"}
                </Badge>
              </div>
            }
          />
        }
      >
        <div className="eth-triage-console">
          <section className="eth-triage-console__queue">
            <DataTable
              columns={ISSUE_COLUMNS}
              rows={rows}
              loading={issueOpenqueueQuery.isLoading}
              selectedRowId={selected?.id}
              onRowClick={(row: IssueRecord) => setSelectedId(row.id)}
            />
          </section>
          <section className="eth-triage-console__detail">
            {issueOpenqueueQuery.error ? (
              <InlineNotification
                kind="error"
                title="Queue unavailable"
                subtitle={issueOpenqueueQuery.error.message}
              />
            ) : null}
            {selected ? (
              <article className="eth-triage-console__issue">
                <div>
                  <Tag>Issue</Tag>
                  <h2>{selected.title ?? selected.id}</h2>
                  <p>{selected.repo}</p>
                </div>
                <dl>
                  <dt>Id</dt>
                  <dd>{formatValue(selected.id)}</dd>
                  <dt>Repo</dt>
                  <dd>{formatValue(selected.repo)}</dd>
                  <dt>State</dt>
                  <dd>{formatValue(selected.state)}</dd>
                  <dt>Labels</dt>
                  <dd>{formatValue(selected.labels)}</dd>
                  <dt>Assignee</dt>
                  <dd>{formatValue(selected.assignee)}</dd>
                  <dt>Priority</dt>
                  <dd>{formatValue(selected.priority)}</dd>
                  <dt>Created At</dt>
                  <dd>{formatValue(selected.createdAt)}</dd>
                </dl>
              </article>
            ) : (
              <InlineNotification
                kind="info"
                title="No records"
                subtitle="Issue queue is empty."
              />
            )}
          </section>
          <aside className="eth-triage-console__actions">
            <Select
              labelText="Priority"
              value={priority}
              onChange={(event: { target: { value: string } }) => setPriority(event.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <TextInput
              labelText="Assignee"
              value={assignee}
              onChange={(event: { target: { value: string } }) => setAssignee(event.target.value)}
            />
            <Textarea
              labelText="Comment"
              value={commentBody}
              onChange={(event: { target: { value: string } }) => setCommentBody(event.target.value)}
            />
            <TaskApprovalPanel
              items={visibleActions}
              selectedItemId={selected?.id}
              onApprove={(action: ProcessAction) => {
                void runAction(action);
              }}
            />
            <div className="eth-triage-console__buttons">
              {visibleActions.map((action) => (
                <Button
                  key={action.id}
                  disabled={!selected || !action.canRun || action.isRunning}
                  onClick={() => {
                    void runAction(action);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </aside>
        </div>
      </AppPageLayout>
    </WorkspaceShell>
  );
}

function buildProcessInput(
  action: ProcessAction,
  issue: IssueRecord,
  draft: { assignee: string; commentBody: string; priority: string },
): Record<string, unknown> & { reason?: string } {
  switch (action.id) {
    case "issue.assign":
      return {
        issueId: issue.id,
        assignee: draft.assignee || String(issue.assignee ?? "triage-lead"),
      };
    case "issue.comment":
      return {
        issueId: issue.id,
        body: draft.commentBody || "Triage update",
      };
    case "issue.triage":
      return {
        issueId: issue.id,
        priority: draft.priority || String(issue.priority ?? "low"),
        labels: issue.labels ?? [],
        reason: "Governed Issue Triage from Issue console",
      };
  }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}
