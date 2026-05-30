import type { ComponentImport } from "../types.js";

export const standardTemplateIds = [
  "EntityTable",
  "EntityDetail",
  "EntityForm",
  "AuditLog",
  "ApprovalQueue",
  "Settings",
] as const;

export type StandardTemplateId = (typeof standardTemplateIds)[number];

export const primaryTemplateComponents: Record<
  StandardTemplateId,
  ComponentImport
> = {
  EntityTable: { package: "@echothink-ui/data", import: "DataTable" },
  EntityDetail: { package: "@echothink-ui/data", import: "PropertyList" },
  EntityForm: { package: "@echothink-ui/forms", import: "SchemaForm" },
  AuditLog: { package: "@echothink-ui/data", import: "AuditLogTable" },
  ApprovalQueue: {
    package: "@echothink-ui/task",
    import: "TaskApprovalPanel",
  },
  Settings: { package: "@echothink-ui/forms", import: "SettingsPanel" },
};

const layoutImports = [
  { package: "@echothink-ui/layouts", import: "AppPageLayout" },
  { package: "@echothink-ui/layouts", import: "PageHeader" },
] satisfies ComponentImport[];

const templateImports: Record<StandardTemplateId, ComponentImport[]> = {
  EntityTable: [
    ...layoutImports,
    { package: "@echothink-ui/data", import: "DataTable" },
    { package: "@echothink-ui/data", import: "FilterBar" },
    { package: "@echothink-ui/data", import: "Pagination" },
  ],
  EntityDetail: [
    ...layoutImports,
    { package: "@echothink-ui/data", import: "PropertyList" },
    { package: "@echothink-ui/data", import: "KeyValueTable" },
    { package: "@echothink-ui/layouts", import: "RightInspectorPanel" },
  ],
  EntityForm: [
    ...layoutImports,
    { package: "@echothink-ui/forms", import: "SchemaForm" },
    { package: "@echothink-ui/forms", import: "DynamicForm" },
    { package: "@echothink-ui/forms", import: "ValidationSummary" },
  ],
  AuditLog: [
    ...layoutImports,
    { package: "@echothink-ui/data", import: "AuditLogTable" },
  ],
  ApprovalQueue: [
    ...layoutImports,
    { package: "@echothink-ui/task", import: "TaskApprovalPanel" },
    { package: "@echothink-ui/task", import: "DecisionRequiredPanel" },
  ],
  Settings: [
    ...layoutImports,
    { package: "@echothink-ui/forms", import: "SettingsPanel" },
  ],
};

export function isStandardTemplateId(id: string): id is StandardTemplateId {
  return standardTemplateIds.includes(id as StandardTemplateId);
}

export function importsForTemplate(id: string): ComponentImport[] {
  if (!isStandardTemplateId(id)) {
    return [];
  }
  return dedupeImports(templateImports[id]);
}

function dedupeImports(imports: ComponentImport[]): ComponentImport[] {
  const seen = new Set<string>();
  const deduped: ComponentImport[] = [];
  for (const componentImport of imports) {
    const key = `${componentImport.package}:${componentImport.import}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ ...componentImport });
  }
  return deduped;
}
