# Echothink-UI Component Inventory (authoritative, extracted from source)

All packages are `@echothink-ui/<name>` at version `0.1.0`, built on IBM Carbon Design
System (NOT Tailwind). Each package exposes a `<Name>ComponentNames` const array and
exports the components below. Generated surfaces import from these packages and must also
import the package's `./styles.css`.

> Note: there is **no** literal `EntityTable` export. The logical page-template
> `EntityTable` maps to the real `DataTable` (or `DataGrid`) component in `@echothink-ui/data`.

## @echothink-ui/core — primitives
ActionGroup, Badge, Button, Checkbox, ComboBox, DatePicker, Drawer, EmptyState, ErrorState,
FormField, FormSection, FormValidationMessage, IconButton, InlineNotification, LinkButton,
LoadingSpinner, Modal, MultiSelect, NumberInput, Panel, Popover, RadioGroup, SearchInput,
Select, Skeleton, Slider, StatusDot, Surface, Tag, Textarea, TextInput, TimePicker, Toast,
Toggle, Tooltip
(also exports `createSurfaceComponent(displayName)`, `EthIntent`, `EthDensity`,
`EthSeverity`, `EthOperationalStatus`)

## @echothink-ui/data — tables & grids
ActivityList, AuditLogTable, BulkActionTable, ChangeLogTable, ColumnManager, DataGrid,
DataTable, DiffTable, EditableTable, FilterBar, KeyValueTable, MetricTable, Pagination,
PropertyList, SavedViewSelector, SortControl, StatusTable, TreeTable, VirtualizedTable

## @echothink-ui/layouts — page layout shells
BrowserShell, BrowserTopBar, BrowserTabStrip, BrowserTab, ProjectTabCollection,
AddressCommandBar, WorkspaceShell, TargetScopeRail, PageHeader, SectionHeader, Toolbar,
Breadcrumb, SideNav, TopNav, SplitPane, ResizablePanel, RightInspectorPanel, ContextPanel,
InspectorStack, WorkspaceCanvas, ResponsiveContainer, AppPageLayout, DashboardPage,
PanelGrid, TemplateShell

## @echothink-ui/forms — configuration & schema-driven forms
DynamicForm, SchemaForm, ConfigForm, SettingsPanel, APIConnectionForm,
CredentialReferenceField, EnvironmentSelector, RuleBuilder, ConditionBuilder,
WebhookConfigPanel, IntegrationConfigPanel, ModelConfigPanel, ModelProviderSelector,
SecretReferenceDisplay, ValidationSummary

## @echothink-ui/task — task/approval/workflow blocks
TaskCard, TaskTable, TaskDetailPanel, TaskStatusBadge, TaskProgressIndicator,
TaskDependencyList, TaskTimeline, TaskWaveTable, TaskWaveHeader, TaskWaveDAG, DAGNode,
DAGEdge, DAGLegend, TaskApprovalPanel, DecisionRequiredPanel, BackendThinkingChain,
HumanInterventionPanel, BlockingReasonPanel, TaskHandoffPanel, TaskRunLog, TaskRetryPanel,
MobileTaskShell

## @echothink-ui/identity — identity/permissions
IdentityCard, UserPicker, GroupPicker, TeamList, RoleBadge, PermissionMatrix,
AccessReviewPanel, InviteUserPanel, OrganizationSwitcher, AccountMenu, SessionStatus,
AuditTrail, PolicyRuleViewer, ApprovalPolicyEditor

## @echothink-ui/activity — notifications/audit/incidents
NotificationCenter, NotificationItem, ActivityFeed, ActivityTimeline, AlertBanner,
SystemStatusBanner, IncidentPanel, ChangelogPanel, SubscriptionPreferences, MentionList,
WatcherList, AuditLogTable

## @echothink-ui/charts — analytics/dashboards
ChartBlock, TimeSeriesChart, LineChart, BarChart, StackedBarChart, AreaChart, PieChart,
DonutChart, ScatterPlot, Heatmap, Histogram, BoxPlot, FunnelChart, SankeyChart, Gauge,
KPIBlock, MetricCard, MetricTrend, DashboardGrid, AnalyticsPanel, QueryResultChart,
DataPreviewPanel, ChartConfigPanel, ChartEmptyState, ChartErrorState

## Other packages (referenced, not enumerated here)
@echothink-ui/inbox, /project, /calendar, /agent, /admin, /todo, /voice, /annotation,
/quality, /resources, /search, /workflow, /documents, /app-domain, /templates, /runtime,
/skills, /tokens, /carbon-theme, /icons, /motion, /validators, /accessibility, /telemetry

## Standard page-template → component mapping (for the surface factory)
| Logical page template | Component(s)                              | Package                |
| --------------------- | ----------------------------------------- | ---------------------- |
| EntityTable           | DataTable (+ FilterBar, Pagination)       | @echothink-ui/data     |
| EntityDetail          | PropertyList / KeyValueTable + RightInspectorPanel | @echothink-ui/data, /layouts |
| EntityForm            | SchemaForm / DynamicForm + ValidationSummary | @echothink-ui/forms |
| AuditLog              | AuditLogTable                             | @echothink-ui/data     |
| ApprovalQueue         | TaskApprovalPanel / DecisionRequiredPanel | @echothink-ui/task     |
| Settings              | SettingsPanel                             | @echothink-ui/forms    |
| Dashboard             | DashboardPage + DashboardGrid + KPIBlock  | @echothink-ui/layouts, /charts |
| Inbox                 | (InboxShell)                              | @echothink-ui/inbox    |
| Calendar              | (CalendarShell)                           | @echothink-ui/calendar |

All standard surfaces are wrapped in `AppPageLayout` + `PageHeader` from
`@echothink-ui/layouts`.
