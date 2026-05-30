import type {
  RegistryAllowedAction,
  RegistryComponent,
  RegistryComponentKind,
  RegistryDataBinding,
} from "./types.js";

const ALL_SURFACE_TYPES = ["standard", "composed", "custom"] as const;
const STANDARD_COMPOSED = ["standard", "composed"] as const;
const STANDARD_ONLY = ["standard"] as const;

const BLOCK_VALIDATION = {
  storybookRequired: true,
  a11yLevel: "AA" as const,
};

interface ComponentOptions {
  importName?: string;
  kind: RegistryComponentKind;
  surfaceTypes?: RegistryComponent["surfaceTypes"];
  requiredProps?: string[];
  dataBindings?: RegistryDataBinding[];
  allowedActions?: RegistryAllowedAction[];
  examples?: string[];
  description?: string;
}

function createComponent(
  id: string,
  packageName: string,
  options: ComponentOptions,
): RegistryComponent {
  const kind = options.kind;
  return {
    id,
    package: packageName,
    import: options.importName ?? id,
    kind,
    surfaceTypes: [...(options.surfaceTypes ?? STANDARD_COMPOSED)],
    ...(options.requiredProps ? { requiredProps: [...options.requiredProps] } : {}),
    ...(options.dataBindings ? { dataBindings: [...options.dataBindings] } : {}),
    ...(options.allowedActions
      ? { allowedActions: [...options.allowedActions] }
      : {}),
    ...(options.examples ? { examples: [...options.examples] } : {}),
    ...(kind === "primitive" ? {} : { validation: BLOCK_VALIDATION }),
    ...(options.description ? { description: options.description } : {}),
  };
}

function primitive(id: string): RegistryComponent {
  return createComponent(id, "@echothink-ui/core", {
    kind: "primitive",
    surfaceTypes: [...ALL_SURFACE_TYPES],
    description: `${id} Carbon primitive from @echothink-ui/core.`,
  });
}

function dataBlock(id: string): RegistryComponent {
  const processEnabled = new Set([
    "BulkActionTable",
    "DataGrid",
    "DataTable",
    "EditableTable",
    "StatusTable",
    "TreeTable",
  ]);
  const eventBacked = id === "AuditLogTable" || id === "ChangeLogTable";

  return createComponent(id, "@echothink-ui/data", {
    kind: "block",
    requiredProps: tableLike(id) ? ["columns", "rows"] : undefined,
    dataBindings: eventBacked ? ["event", "entityQuery"] : ["entityQuery"],
    allowedActions: processEnabled.has(id)
      ? ["entity.query", "process.run"]
      : eventBacked
        ? ["event.subscribe", "entity.query"]
        : ["entity.query"],
    examples: [`examples/data/${kebabCase(id)}.tsx`],
    description: `${id} data block for table, grid, list, metric, or record views.`,
  });
}

function layoutComponent(id: string): RegistryComponent {
  const pageTemplates = new Set([
    "AppPageLayout",
    "BrowserShell",
    "DashboardPage",
    "TemplateShell",
    "WorkspaceShell",
  ]);

  return createComponent(id, "@echothink-ui/layouts", {
    kind: pageTemplates.has(id) ? "page-template" : "block",
    surfaceTypes: [...ALL_SURFACE_TYPES],
    dataBindings: [],
    allowedActions: [],
    examples: [`examples/layouts/${kebabCase(id)}.tsx`],
    description: `${id} layout shell or structural block for Echothink workspaces.`,
  });
}

function formBlock(id: string): RegistryComponent {
  const processForms = new Set([
    "ConfigForm",
    "DynamicForm",
    "RuleBuilder",
    "SchemaForm",
    "WebhookConfigPanel",
  ]);

  return createComponent(id, "@echothink-ui/forms", {
    kind: "block",
    dataBindings: processForms.has(id) ? ["unitProcess"] : ["entityQuery"],
    allowedActions: processForms.has(id)
      ? ["process.run"]
      : ["entity.query", "process.run"],
    examples: [`examples/forms/${kebabCase(id)}.tsx`],
    description: `${id} form or settings block for schema-driven configuration.`,
  });
}

function taskBlock(id: string): RegistryComponent {
  return createComponent(id, "@echothink-ui/task", {
    kind: "block",
    dataBindings: ["unitProcess"],
    allowedActions: ["process.run", "entity.query"],
    examples: [`examples/task/${kebabCase(id)}.tsx`],
    description: `${id} workflow, approval, or task execution block.`,
  });
}

function identityBlock(id: string): RegistryComponent {
  const mutationCapable = new Set([
    "AccessReviewPanel",
    "ApprovalPolicyEditor",
    "InviteUserPanel",
    "PermissionMatrix",
    "UserPicker",
  ]);

  return createComponent(id, "@echothink-ui/identity", {
    kind: "block",
    dataBindings: ["entityQuery", "unitProcess"],
    allowedActions: mutationCapable.has(id)
      ? ["entity.query", "process.run"]
      : ["entity.query"],
    examples: [`examples/identity/${kebabCase(id)}.tsx`],
    description: `${id} identity, role, access-review, or permission block.`,
  });
}

function activityBlock(id: string): RegistryComponent {
  const componentId = id === "AuditLogTable" ? "ActivityAuditLogTable" : id;
  return createComponent(componentId, "@echothink-ui/activity", {
    importName: id,
    kind: "block",
    dataBindings: ["event"],
    allowedActions: ["event.subscribe"],
    examples: [`examples/activity/${kebabCase(componentId)}.tsx`],
    description:
      id === "AuditLogTable"
        ? "AuditLogTable export from @echothink-ui/activity for activity timelines."
        : `${id} activity, notification, audit, or incident block.`,
  });
}

function chartBlock(id: string): RegistryComponent {
  return createComponent(id, "@echothink-ui/charts", {
    kind: "block",
    dataBindings: ["entityQuery"],
    allowedActions: ["entity.query"],
    examples: [`examples/charts/${kebabCase(id)}.tsx`],
    description: `${id} analytics, chart, KPI, or dashboard visualization block.`,
  });
}

function tableLike(id: string): boolean {
  return id.includes("Table") || id.includes("Grid") || id.includes("List");
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

const coreComponentNames = [
  "ActionGroup",
  "Badge",
  "Button",
  "Checkbox",
  "ComboBox",
  "DatePicker",
  "Drawer",
  "EmptyState",
  "ErrorState",
  "FormField",
  "FormSection",
  "FormValidationMessage",
  "IconButton",
  "InlineNotification",
  "LinkButton",
  "LoadingSpinner",
  "Modal",
  "MultiSelect",
  "NumberInput",
  "Panel",
  "Popover",
  "RadioGroup",
  "SearchInput",
  "Select",
  "Skeleton",
  "Slider",
  "StatusDot",
  "Surface",
  "Tag",
  "Textarea",
  "TextInput",
  "TimePicker",
  "Toast",
  "Toggle",
  "Tooltip",
] as const;

const dataComponentNames = [
  "ActivityList",
  "AuditLogTable",
  "BulkActionTable",
  "ChangeLogTable",
  "ColumnManager",
  "DataGrid",
  "DataTable",
  "DiffTable",
  "EditableTable",
  "FilterBar",
  "KeyValueTable",
  "MetricTable",
  "Pagination",
  "PropertyList",
  "SavedViewSelector",
  "SortControl",
  "StatusTable",
  "TreeTable",
  "VirtualizedTable",
] as const;

const layoutComponentNames = [
  "BrowserShell",
  "BrowserTopBar",
  "BrowserTabStrip",
  "BrowserTab",
  "ProjectTabCollection",
  "AddressCommandBar",
  "WorkspaceShell",
  "TargetScopeRail",
  "PageHeader",
  "SectionHeader",
  "Toolbar",
  "Breadcrumb",
  "SideNav",
  "TopNav",
  "SplitPane",
  "ResizablePanel",
  "RightInspectorPanel",
  "ContextPanel",
  "InspectorStack",
  "WorkspaceCanvas",
  "ResponsiveContainer",
  "AppPageLayout",
  "DashboardPage",
  "PanelGrid",
  "TemplateShell",
] as const;

const formComponentNames = [
  "DynamicForm",
  "SchemaForm",
  "ConfigForm",
  "SettingsPanel",
  "APIConnectionForm",
  "CredentialReferenceField",
  "EnvironmentSelector",
  "RuleBuilder",
  "ConditionBuilder",
  "WebhookConfigPanel",
  "IntegrationConfigPanel",
  "ModelConfigPanel",
  "ModelProviderSelector",
  "SecretReferenceDisplay",
  "ValidationSummary",
] as const;

const taskComponentNames = [
  "TaskCard",
  "TaskTable",
  "TaskDetailPanel",
  "TaskStatusBadge",
  "TaskProgressIndicator",
  "TaskDependencyList",
  "TaskTimeline",
  "TaskWaveTable",
  "TaskWaveHeader",
  "TaskWaveDAG",
  "DAGNode",
  "DAGEdge",
  "DAGLegend",
  "TaskApprovalPanel",
  "DecisionRequiredPanel",
  "BackendThinkingChain",
  "HumanInterventionPanel",
  "BlockingReasonPanel",
  "TaskHandoffPanel",
  "TaskRunLog",
  "TaskRetryPanel",
  "MobileTaskShell",
] as const;

const identityComponentNames = [
  "IdentityCard",
  "UserPicker",
  "GroupPicker",
  "TeamList",
  "RoleBadge",
  "PermissionMatrix",
  "AccessReviewPanel",
  "InviteUserPanel",
  "OrganizationSwitcher",
  "AccountMenu",
  "SessionStatus",
  "AuditTrail",
  "PolicyRuleViewer",
  "ApprovalPolicyEditor",
] as const;

const activityComponentNames = [
  "NotificationCenter",
  "NotificationItem",
  "ActivityFeed",
  "ActivityTimeline",
  "AlertBanner",
  "SystemStatusBanner",
  "IncidentPanel",
  "ChangelogPanel",
  "SubscriptionPreferences",
  "MentionList",
  "WatcherList",
  "AuditLogTable",
] as const;

const chartComponentNames = [
  "ChartBlock",
  "TimeSeriesChart",
  "LineChart",
  "BarChart",
  "StackedBarChart",
  "AreaChart",
  "PieChart",
  "DonutChart",
  "ScatterPlot",
  "Heatmap",
  "Histogram",
  "BoxPlot",
  "FunnelChart",
  "SankeyChart",
  "Gauge",
  "KPIBlock",
  "MetricCard",
  "MetricTrend",
  "DashboardGrid",
  "AnalyticsPanel",
  "QueryResultChart",
  "DataPreviewPanel",
  "ChartConfigPanel",
  "ChartEmptyState",
  "ChartErrorState",
] as const;

export const components: RegistryComponent[] = [
  ...coreComponentNames.map(primitive),
  ...dataComponentNames.map(dataBlock),
  ...layoutComponentNames.map(layoutComponent),
  ...formComponentNames.map(formBlock),
  ...taskComponentNames.map(taskBlock),
  ...identityComponentNames.map(identityBlock),
  ...activityComponentNames.map(activityBlock),
  ...chartComponentNames.map(chartBlock),
  createComponent("EntityTableTemplate", "@echothink-ui/data", {
    importName: "DataTable",
    kind: "page-template",
    surfaceTypes: [...STANDARD_ONLY],
    requiredProps: ["columns", "query", "rowActions"],
    dataBindings: ["entityQuery", "unitProcess"],
    allowedActions: ["entity.query", "process.run"],
    examples: ["examples/standard/entity-table.surface.yaml"],
    description:
      "Logical EntityTable page template backed by the DataTable export.",
  }),
].sort((left, right) => left.id.localeCompare(right.id));
