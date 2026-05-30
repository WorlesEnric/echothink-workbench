export interface Issuetriageinput {
  issueId: string;
  priority: "low" | "medium" | "high" | "urgent";
  labels: string[];
}

export type Issuetriageoutput = Record<string, never>;

export interface Issueassigninput {
  issueId: string;
  assignee: string;
}

export type Issueassignoutput = Record<string, never>;

export interface Issuecommentinput {
  issueId: string;
  body: string;
}

export type Issuecommentoutput = Record<string, never>;

export const processContracts = {
  "issue.triage": {
    "input": [
      {
        "name": "issueId",
        "kind": "string",
        "optional": false
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
        "name": "labels",
        "kind": "string",
        "optional": false,
        "arrayOf": "string"
      }
    ],
    "output": [],
    "requires": {
      "permission": "issue.triage"
    },
    "preconditions": [
      "Issue.state in [open]"
    ],
    "reads": [
      "Issue"
    ],
    "writes": [
      "Issue"
    ],
    "transitions": [
      {
        "kind": "exact",
        "target": "Issue.state",
        "entity": "Issue",
        "field": "state",
        "from": "open",
        "to": "triaged"
      }
    ],
    "emits": [
      "issue.triaged"
    ],
    "effects": [],
    "audit": {
      "level": "always",
      "reasonRequired": true
    },
    "actorType": "human",
    "policyClass": "side_effect_low"
  },
  "issue.assign": {
    "input": [
      {
        "name": "issueId",
        "kind": "string",
        "optional": false
      },
      {
        "name": "assignee",
        "kind": "string",
        "optional": false
      }
    ],
    "output": [],
    "requires": {
      "permission": "issue.assign"
    },
    "preconditions": [
      "Issue.state in [triaged]"
    ],
    "reads": [
      "Issue"
    ],
    "writes": [
      "Issue"
    ],
    "transitions": [
      {
        "kind": "exact",
        "target": "Issue.state",
        "entity": "Issue",
        "field": "state",
        "from": "triaged",
        "to": "assigned"
      }
    ],
    "emits": [
      "issue.assigned"
    ],
    "effects": [],
    "audit": {
      "level": "always",
      "reasonRequired": false
    },
    "actorType": "human",
    "policyClass": "side_effect_low"
  },
  "issue.comment": {
    "input": [
      {
        "name": "issueId",
        "kind": "string",
        "optional": false
      },
      {
        "name": "body",
        "kind": "string",
        "optional": false
      }
    ],
    "output": [],
    "requires": {
      "permission": "issue.comment"
    },
    "preconditions": [],
    "reads": [
      "Issue"
    ],
    "writes": [],
    "transitions": [],
    "emits": [],
    "effects": [
      "github.issue.comment"
    ],
    "audit": {
      "level": "always",
      "reasonRequired": false
    },
    "actorType": "human",
    "policyClass": "side_effect_high"
  }
} as const;
