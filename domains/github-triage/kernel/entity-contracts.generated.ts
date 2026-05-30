export interface Issue {
  id: string;
  repo: string;
  title: string;
  state: "open" | "triaged" | "assigned" | "closed";
  labels: string[];
  assignee: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
}

export const entityContracts = {
  "Issue": {
    "key": "issue",
    "schema": [
      {
        "name": "id",
        "kind": "string",
        "optional": false
      },
      {
        "name": "repo",
        "kind": "string",
        "optional": false
      },
      {
        "name": "title",
        "kind": "string",
        "optional": false
      },
      {
        "name": "state",
        "kind": "enum",
        "optional": false,
        "enumValues": [
          "open",
          "triaged",
          "assigned",
          "closed"
        ]
      },
      {
        "name": "labels",
        "kind": "string",
        "optional": false,
        "arrayOf": "string"
      },
      {
        "name": "assignee",
        "kind": "string",
        "optional": true
      },
      {
        "name": "priority",
        "kind": "enum",
        "optional": false,
        "enumValues": [
          "low",
          "medium",
          "high",
          "urgent"
        ]
      },
      {
        "name": "createdAt",
        "kind": "date",
        "optional": false
      }
    ],
    "tenantScope": "organization",
    "stateField": "state",
    "stateMachine": {
      "initial": "open",
      "transitions": [
        {
          "from": "open",
          "to": "triaged",
          "via": "issue.triage"
        },
        {
          "from": "triaged",
          "to": "assigned",
          "via": "issue.assign"
        },
        {
          "from": "assigned",
          "to": "closed"
        }
      ]
    },
    "audit": {
      "read": "sampled",
      "write": "always"
    }
  }
} as const;
