import type { RegistryRecipe } from "./types.js";

export const recipes: RegistryRecipe[] = [
  {
    id: "triage-console",
    title: "Triage Console",
    description:
      "Workspace shell combining an issue DataTable, approval panel, and process actions for queue triage.",
    surfaceType: "composed",
    components: [
      "WorkspaceShell",
      "AppPageLayout",
      "PageHeader",
      "DataTable",
      "TaskApprovalPanel",
      "DecisionRequiredPanel",
    ],
    sdkHooks: ["useEntityQuery", "useProcess", "usePermission"],
    exampleRef: "examples/compositions/triage-console.tsx",
  },
  {
    id: "audit-operations",
    title: "Audit Operations",
    description:
      "Operational audit view with timeline, audit log table, and incident context.",
    surfaceType: "composed",
    components: [
      "AppPageLayout",
      "PageHeader",
      "AuditLogTable",
      "ActivityTimeline",
      "IncidentPanel",
    ],
    sdkHooks: ["useDomainEvent", "useEntityQuery"],
    exampleRef: "examples/compositions/audit-operations.tsx",
  },
  {
    id: "settings-governance",
    title: "Settings Governance",
    description:
      "Settings panel paired with permission and access review blocks for governed domain configuration.",
    surfaceType: "composed",
    components: [
      "AppPageLayout",
      "PageHeader",
      "SettingsPanel",
      "PermissionMatrix",
      "AccessReviewPanel",
    ],
    sdkHooks: ["usePermission", "useProcess"],
    exampleRef: "examples/compositions/settings-governance.tsx",
  },
];
