export interface GitHubTriageDomain {
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
      args: {
        state?: unknown;
      };
      row: GitHubTriageDomain["entities"]["Issue"];
    };
  };
  processes: {
    "issue.triage": {
      input: {
        issueId: string;
        priority: "low" | "medium" | "high" | "urgent";
        labels: string[];
      };
      output: Record<string, never>;
    };
    "issue.assign": {
      input: {
        issueId: string;
        assignee: string;
      };
      output: Record<string, never>;
    };
    "issue.comment": {
      input: {
        issueId: string;
        body: string;
      };
      output: Record<string, never>;
    };
  };
  events: {
    "issue.triaged": {
      issueId: string;
      priority: string;
      actorId: string;
    };
    "issue.assigned": {
      issueId: string;
      assignee: string;
      actorId: string;
    };
  };
  effects: {
    "github.issue.comment": {
      input: {
        repo: string;
        issueNumber: number;
        body: string;
      };
      output: {
        commentId: string;
        url: string;
      };
    };
    "github.issue.label": {
      input: {
        repo: string;
        issueNumber: number;
        labels: string[];
      };
      output: Record<string, never>;
    };
  };
  permissions: "issue.read" | "issue.triage" | "issue.assign" | "issue.comment";
}
