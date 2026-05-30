export type PermissionCapability = "process.run" | "entity.query" | "entity.get" | "event.subscribe" | "effect.invoke";

export type Role = "admin" | "triage_lead" | "reviewer" | "viewer";
export type PermissionId = "issue.read" | "issue.triage" | "issue.assign" | "issue.comment";

export interface PermissionMatrixRow {
  role: Role;
  capability: PermissionCapability;
  target: string;
  permission?: PermissionId;
  allowed: boolean;
}

export const permissionMatrix: PermissionMatrixRow[] = [
  {
    "role": "admin",
    "capability": "process.run",
    "target": "issue.triage",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "process.run",
    "target": "issue.triage",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "process.run",
    "target": "issue.triage",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "process.run",
    "target": "issue.triage",
    "permission": "issue.triage",
    "allowed": false
  },
  {
    "role": "admin",
    "capability": "process.run",
    "target": "issue.assign",
    "permission": "issue.assign",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "process.run",
    "target": "issue.assign",
    "permission": "issue.assign",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "process.run",
    "target": "issue.assign",
    "permission": "issue.assign",
    "allowed": false
  },
  {
    "role": "viewer",
    "capability": "process.run",
    "target": "issue.assign",
    "permission": "issue.assign",
    "allowed": false
  },
  {
    "role": "admin",
    "capability": "process.run",
    "target": "issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "process.run",
    "target": "issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "process.run",
    "target": "issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "process.run",
    "target": "issue.comment",
    "permission": "issue.comment",
    "allowed": false
  },
  {
    "role": "admin",
    "capability": "entity.query",
    "target": "issue.openQueue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "entity.query",
    "target": "issue.openQueue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "entity.query",
    "target": "issue.openQueue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "entity.query",
    "target": "issue.openQueue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "admin",
    "capability": "entity.get",
    "target": "Issue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "entity.get",
    "target": "Issue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "entity.get",
    "target": "Issue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "entity.get",
    "target": "Issue",
    "permission": "issue.read",
    "allowed": true
  },
  {
    "role": "admin",
    "capability": "event.subscribe",
    "target": "issue.triaged",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "event.subscribe",
    "target": "issue.triaged",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "event.subscribe",
    "target": "issue.triaged",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "event.subscribe",
    "target": "issue.triaged",
    "allowed": true
  },
  {
    "role": "admin",
    "capability": "event.subscribe",
    "target": "issue.assigned",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "event.subscribe",
    "target": "issue.assigned",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "event.subscribe",
    "target": "issue.assigned",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "event.subscribe",
    "target": "issue.assigned",
    "allowed": true
  },
  {
    "role": "admin",
    "capability": "effect.invoke",
    "target": "github.issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "effect.invoke",
    "target": "github.issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "effect.invoke",
    "target": "github.issue.comment",
    "permission": "issue.comment",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "effect.invoke",
    "target": "github.issue.comment",
    "permission": "issue.comment",
    "allowed": false
  },
  {
    "role": "admin",
    "capability": "effect.invoke",
    "target": "github.issue.label",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "triage_lead",
    "capability": "effect.invoke",
    "target": "github.issue.label",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "reviewer",
    "capability": "effect.invoke",
    "target": "github.issue.label",
    "permission": "issue.triage",
    "allowed": true
  },
  {
    "role": "viewer",
    "capability": "effect.invoke",
    "target": "github.issue.label",
    "permission": "issue.triage",
    "allowed": false
  }
];

export function rolesForPermission(p: PermissionId): Role[] {
  const roles = new Set<Role>();
  for (const row of permissionMatrix) {
    if (row.permission === p && row.allowed) {
      roles.add(row.role);
    }
  }
  return [...roles];
}
