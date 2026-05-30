import type {
  CompiledManifest,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  SurfaceRegistration,
} from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import {
  arrayLiteral,
  camelCase,
  labelForField,
  literal,
  pascalCase,
  processesForSurface,
  propertyKey,
  resolveSurfaceEntity,
  resolveSurfaceQuery,
  safeIdentifier,
  titleCase,
  typeForField,
} from "./utils.js";

export function scaffoldComposedSurface(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): GeneratedFile[] {
  const basePath = `surfaces/composed/${surface.id}`;
  return [
    {
      path: `${basePath}/index.tsx`,
      contents: renderComposedIndex(compiled, surface),
    },
    {
      path: `${basePath}/stories.tsx`,
      contents: renderComposedStory(compiled, surface),
    },
    {
      path: `${basePath}/tests.spec.tsx`,
      contents: renderComposedSmokeTest(compiled, surface),
    },
  ];
}

function renderComposedIndex(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const entity = requireSurfaceEntity(compiled, surface);
  const query = requireSurfaceQuery(compiled, surface);
  const processes = processesForSurface(compiled, surface);
  const componentName = `${pascalCase(surface.id)}Surface`;
  const domainType = `${pascalCase(compiled.manifest.metadata.id)}SurfaceDomain`;
  const entityType = `${entity.name}Record`;
  const issueLikeName = camelCase(entity.name);

  const lines: string[] = [];
  lines.push('import type { DomainDescriptor } from "@echothink/app-domain-sdk";');
  lines.push(
    'import { useAppDomain, useEntityQuery, useProcess } from "@echothink/app-domain-sdk/react";',
  );
  lines.push(
    'import { Badge, Button, InlineNotification, Select, Tag, Textarea, TextInput } from "@echothink-ui/core";',
  );
  lines.push('import { DataTable } from "@echothink-ui/data";');
  lines.push(
    'import { AppPageLayout, PageHeader, WorkspaceShell } from "@echothink-ui/layouts";',
  );
  lines.push('import { TaskApprovalPanel } from "@echothink-ui/task";');
  lines.push(
    'import { useMemo, useState, type ReactElement } from "react";',
  );
  lines.push("");
  lines.push(renderDomainDescriptor(compiled, domainType));
  lines.push("");
  lines.push(`type ${entityType} = ${domainType}["entities"][${literal(entity.name)}];`);
  lines.push("");
  lines.push("interface ProcessAction {");
  lines.push(renderProcessActionId(processes));
  lines.push("  label: string;");
  lines.push("  permission?: string;");
  lines.push("  policyClass?: string;");
  lines.push("  effectIds: string[];");
  lines.push("  reasonRequired: boolean;");
  lines.push("}");
  lines.push("");
  lines.push("interface ProcessRunner {");
  lines.push("  run(input: Record<string, unknown> & { reason?: string }): Promise<unknown>;");
  lines.push("  canRun: boolean;");
  lines.push("  isRunning: boolean;");
  lines.push("}");
  lines.push("");
  lines.push(
    `const QUERY_ID = ${literal(query.id)} as const;`,
  );
  lines.push(
    `const SURFACE_ID = ${literal(surface.id)} as const;`,
  );
  lines.push(
    `const REQUIRED_PERMISSIONS = ${arrayLiteral(surface.requiredPermissions)} as const;`,
  );
  lines.push("");
  lines.push(`const ${constantName(entity.name)}_COLUMNS = [`);
  for (const field of entity.fields) {
    lines.push(
      `  { key: ${literal(field.name)}, header: ${literal(labelForField(field.name))} },`,
    );
  }
  lines.push("];");
  lines.push("");
  lines.push("const PROCESS_ACTIONS: ProcessAction[] = [");
  for (const process of processes) {
    lines.push("  {");
    lines.push(`    id: ${literal(process.id)},`);
    lines.push(`    label: ${literal(titleCase(process.id))},`);
    if (process.requires?.permission) {
      lines.push(`    permission: ${literal(process.requires.permission)},`);
    }
    if (process.policyClass) {
      lines.push(`    policyClass: ${literal(process.policyClass)},`);
    }
    lines.push(`    effectIds: ${arrayLiteral(process.effects)},`);
    lines.push(`    reasonRequired: ${process.audit?.reasonRequired === true},`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  lines.push(`export function ${componentName}(): ReactElement {`);
  lines.push(`  const domain = useAppDomain<${domainType}>();`);
  lines.push(`  const identity = domain.identity.current();`);
  lines.push(`  const ${camelCase(query.id)}Query = useEntityQuery<${domainType}, typeof QUERY_ID>(`);
  lines.push("    QUERY_ID,");
  lines.push("    { limit: 50 },");
  lines.push("  );");
  for (const process of processes) {
    const varName = `${safeIdentifier(process.id)}Process`;
    lines.push(
      `  const ${varName} = useProcess<${domainType}, ${literal(process.id)}>(${literal(process.id)});`,
    );
  }
  lines.push(`  const rows = ${camelCase(query.id)}Query.data ?? [];`);
  lines.push("  const [selectedId, setSelectedId] = useState<string | undefined>();");
  lines.push("  const [assignee, setAssignee] = useState(\"\");");
  lines.push("  const [commentBody, setCommentBody] = useState(\"\");");
  lines.push("  const [priority, setPriority] = useState(\"high\");");
  lines.push("");
  lines.push("  const selected = useMemo(() => {");
  lines.push("    return rows.find((row) => row.id === selectedId) ?? rows[0];");
  lines.push("  }, [rows, selectedId]);");
  lines.push("");
  lines.push('  const processRunners: Record<ProcessAction["id"], ProcessRunner> = {');
  for (const process of processes) {
    lines.push(`    ${propertyKey(process.id)}: ${safeIdentifier(process.id)}Process as unknown as ProcessRunner,`);
  }
  lines.push("  };");
  lines.push("");
  lines.push("  const visibleActions = PROCESS_ACTIONS.map((action) => ({");
  lines.push("    ...action,");
  lines.push("    canRun: processRunners[action.id]?.canRun ?? false,");
  lines.push("    isRunning: processRunners[action.id]?.isRunning ?? false,");
  lines.push("  }));");
  lines.push("");
  lines.push("  const runAction = async (action: ProcessAction): Promise<void> => {");
  lines.push("    if (!selected) {");
  lines.push("      return;");
  lines.push("    }");
  lines.push("    const runner = processRunners[action.id];");
  lines.push("    if (!runner?.canRun) {");
  lines.push("      return;");
  lines.push("    }");
  lines.push(
    `    await runner.run(buildProcessInput(action, selected, { assignee, commentBody, priority }));`,
  );
  lines.push(`    await ${camelCase(query.id)}Query.refetch();`);
  lines.push("  };");
  lines.push("");
  lines.push("  return (");
  lines.push(
    `    <WorkspaceShell surfaceId={SURFACE_ID} tenantId={identity.tenantId}>`,
  );
  lines.push("      <AppPageLayout");
  lines.push("        header={");
  lines.push("          <PageHeader");
  lines.push(`            title=${literal(titleCase(surface.id))}`);
  lines.push(`            eyebrow=${literal(compiled.manifest.metadata.name)}`);
  lines.push("            actions={");
  lines.push("              <div className=\"eth-triage-console__topbar\">");
  lines.push("                {REQUIRED_PERMISSIONS.map((permission) => (");
  lines.push("                  <Badge key={permission} tone={domain.permissions.can(permission) ? \"positive\" : \"warning\"}>");
  lines.push("                    {permission}");
  lines.push("                  </Badge>");
  lines.push("                ))}");
  lines.push(
    `                <Badge tone={${camelCase(query.id)}Query.isLoading ? "neutral" : "positive"}>`,
  );
  lines.push(
    `                  {${camelCase(query.id)}Query.isLoading ? "Syncing" : "Synced"}`,
  );
  lines.push("                </Badge>");
  lines.push("              </div>");
  lines.push("            }");
  lines.push("          />");
  lines.push("        }");
  lines.push("      >");
  lines.push("        <div className=\"eth-triage-console\">");
  lines.push("          <section className=\"eth-triage-console__queue\">");
  lines.push(`            <DataTable`);
  lines.push(`              columns={${constantName(entity.name)}_COLUMNS}`);
  lines.push("              rows={rows}");
  lines.push(`              loading={${camelCase(query.id)}Query.isLoading}`);
  lines.push("              selectedRowId={selected?.id}");
  lines.push(`              onRowClick={(row: ${entityType}) => setSelectedId(row.id)}`);
  lines.push("            />");
  lines.push("          </section>");
  lines.push("          <section className=\"eth-triage-console__detail\">");
  lines.push(`            {${camelCase(query.id)}Query.error ? (`);
  lines.push("              <InlineNotification");
  lines.push("                kind=\"error\"");
  lines.push("                title=\"Queue unavailable\"");
  lines.push(`                subtitle={${camelCase(query.id)}Query.error.message}`);
  lines.push("              />");
  lines.push("            ) : null}");
  lines.push("            {selected ? (");
  lines.push("              <article className=\"eth-triage-console__issue\">");
  lines.push("                <div>");
  lines.push(`                  <Tag>${entity.name}</Tag>`);
  lines.push("                  <h2>{selected.title ?? selected.id}</h2>");
  lines.push("                  <p>{selected.repo}</p>");
  lines.push("                </div>");
  lines.push("                <dl>");
  for (const field of entity.fields.filter((field) => field.name !== "title")) {
    lines.push(`                  <dt>${labelForField(field.name)}</dt>`);
    lines.push(`                  <dd>{formatValue(selected.${propertyKey(field.name)})}</dd>`);
  }
  lines.push("                </dl>");
  lines.push("              </article>");
  lines.push("            ) : (");
  lines.push("              <InlineNotification");
  lines.push("                kind=\"info\"");
  lines.push("                title=\"No records\"");
  lines.push(`                subtitle=${literal(`${entity.name} queue is empty.`)}`);
  lines.push("              />");
  lines.push("            )}");
  lines.push("          </section>");
  lines.push("          <aside className=\"eth-triage-console__actions\">");
  lines.push("            <Select");
  lines.push("              labelText=\"Priority\"");
  lines.push("              value={priority}");
  lines.push("              onChange={(event: { target: { value: string } }) => setPriority(event.target.value)}");
  lines.push("            >");
  for (const value of priorityValues(entity)) {
    lines.push(`              <option value=${literal(value)}>${titleCase(value)}</option>`);
  }
  lines.push("            </Select>");
  lines.push("            <TextInput");
  lines.push("              labelText=\"Assignee\"");
  lines.push("              value={assignee}");
  lines.push("              onChange={(event: { target: { value: string } }) => setAssignee(event.target.value)}");
  lines.push("            />");
  lines.push("            <Textarea");
  lines.push("              labelText=\"Comment\"");
  lines.push("              value={commentBody}");
  lines.push("              onChange={(event: { target: { value: string } }) => setCommentBody(event.target.value)}");
  lines.push("            />");
  lines.push("            <TaskApprovalPanel");
  lines.push("              items={visibleActions}");
  lines.push("              selectedItemId={selected?.id}");
  lines.push("              onApprove={(action: ProcessAction) => {");
  lines.push("                void runAction(action);");
  lines.push("              }}");
  lines.push("            />");
  lines.push("            <div className=\"eth-triage-console__buttons\">");
  lines.push("              {visibleActions.map((action) => (");
  lines.push("                <Button");
  lines.push("                  key={action.id}");
  lines.push("                  disabled={!selected || !action.canRun || action.isRunning}");
  lines.push("                  onClick={() => {");
  lines.push("                    void runAction(action);");
  lines.push("                  }}");
  lines.push("                >");
  lines.push("                  {action.label}");
  lines.push("                </Button>");
  lines.push("              ))}");
  lines.push("            </div>");
  lines.push("          </aside>");
  lines.push("        </div>");
  lines.push("      </AppPageLayout>");
  lines.push("    </WorkspaceShell>");
  lines.push("  );");
  lines.push("}");
  lines.push("");
  lines.push("function buildProcessInput(");
  lines.push("  action: ProcessAction,");
  lines.push(`  ${issueLikeName}: ${entityType},`);
  lines.push("  draft: { assignee: string; commentBody: string; priority: string },");
  lines.push("): Record<string, unknown> & { reason?: string } {");
  lines.push("  switch (action.id) {");
  for (const process of processes) {
    lines.push(`    case ${literal(process.id)}:`);
    lines.push(`      return ${renderProcessInputObject(process, entity, issueLikeName)};`);
  }
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("function formatValue(value: unknown): string {");
  lines.push("  if (Array.isArray(value)) {");
  lines.push("    return value.join(\", \");");
  lines.push("  }");
  lines.push("  if (value === null || value === undefined || value === \"\") {");
  lines.push("    return \"-\";");
  lines.push("  }");
  lines.push("  return String(value);");
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

function renderDomainDescriptor(
  compiled: CompiledManifest,
  domainType: string,
): string {
  const lines: string[] = [];
  lines.push(`interface ${domainType} extends DomainDescriptor {`);
  lines.push(`  id: ${literal(compiled.manifest.metadata.id)};`);
  lines.push("  entities: {");
  for (const entity of compiled.normalizedEntities) {
    lines.push(`    ${propertyKey(entity.name)}: {`);
    for (const field of entity.fields) {
      lines.push(`      ${propertyKey(field.name)}: ${typeForField(field)};`);
    }
    lines.push("    };");
  }
  lines.push("  };");
  lines.push("  queries: {");
  for (const [queryId, query] of Object.entries(compiled.manifest.queries)) {
    lines.push(`    ${propertyKey(queryId)}: {`);
    lines.push("      args: Record<string, unknown>;");
    lines.push(`      row: ${domainType}["entities"][${literal(query.entity)}];`);
    lines.push("    };");
  }
  lines.push("  };");
  lines.push("  processes: {");
  for (const process of compiled.normalizedProcesses) {
    lines.push(`    ${propertyKey(process.id)}: {`);
    lines.push("      input: {");
    for (const field of process.input) {
      lines.push(`        ${propertyKey(field.name)}: ${typeForField(field)};`);
    }
    lines.push("      };");
    lines.push("      output: Record<string, unknown>;");
    lines.push("    };");
  }
  lines.push("  };");
  lines.push("  events: Record<string, Record<string, unknown>>;");
  lines.push("  effects: Record<string, { input: Record<string, unknown>; output: unknown }>; ");
  lines.push(
    `  permissions: ${compiled.manifest.permissions.map((permission) => literal(permission.id)).join(" | ")};`,
  );
  lines.push("}");
  return lines.join("\n");
}

function renderProcessActionId(processes: NormalizedProcess[]): string {
  if (processes.length === 0) {
    return "  id: never;";
  }
  return `  id: ${processes.map((process) => literal(process.id)).join(" | ")};`;
}

function renderProcessInputObject(
  process: NormalizedProcess,
  entity: NormalizedEntity,
  entityVar: string,
): string {
  const properties = process.input.map((field) => {
    const expression = inputExpressionForField(field, entity, entityVar);
    return `${propertyKey(field.name)}: ${expression}`;
  });
  if (process.audit?.reasonRequired) {
    properties.push(
      `reason: ${literal(`Governed ${titleCase(process.id)} from ${titleCase(entity.name)} console`)}`,
    );
  }
  if (properties.length === 0) {
    return "{}";
  }
  return `{\n        ${properties.join(",\n        ")},\n      }`;
}

function inputExpressionForField(
  field: NormalizedField,
  entity: NormalizedEntity,
  entityVar: string,
): string {
  const entityFieldNames = new Set(entity.fields.map((candidate) => candidate.name));
  if (field.name === "issueId" || field.name === `${entity.key}Id`) {
    return `${entityVar}.id`;
  }
  if (field.name === "assignee") {
    return `draft.assignee || String(${entityVar}.assignee ?? "triage-lead")`;
  }
  if (field.name === "body") {
    return `draft.commentBody || ${literal("Triage update")}`;
  }
  if (field.name === "priority") {
    return `draft.priority || String(${entityVar}.priority ?? ${literal(firstEnumValue(field, "high"))})`;
  }
  if (entityFieldNames.has(field.name)) {
    return `${entityVar}.${propertyKey(field.name)} ?? ${defaultValueForField(field)}`;
  }
  return defaultValueForField(field);
}

function defaultValueForField(field: NormalizedField): string {
  if (field.arrayOf) {
    return "[]";
  }
  if (field.kind === "enum") {
    return literal(firstEnumValue(field, "default"));
  }
  if (field.kind === "number") {
    return "0";
  }
  if (field.kind === "boolean") {
    return "false";
  }
  if (field.kind === "json") {
    return "{}";
  }
  return literal("");
}

function firstEnumValue(field: NormalizedField, fallback: string): string {
  return field.enumValues?.[0] ?? fallback;
}

function priorityValues(entity: NormalizedEntity): string[] {
  const field = entity.fields.find((candidate) => candidate.name === "priority");
  return field?.enumValues?.length ? field.enumValues : ["low", "medium", "high"];
}

function renderComposedStory(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const componentName = `${pascalCase(surface.id)}Surface`;
  const lines: string[] = [];
  lines.push('import { createAppDomainClient, type Transport } from "@echothink/app-domain-sdk";');
  lines.push('import { AppDomainProvider } from "@echothink/app-domain-sdk/react";');
  lines.push('import { QueryClient, QueryClientProvider } from "@tanstack/react-query";');
  lines.push(`import { ${componentName} } from "./index";`);
  lines.push("");
  lines.push("const queryClient = new QueryClient({");
  lines.push("  defaultOptions: {");
  lines.push("    queries: { retry: false },");
  lines.push("    mutations: { retry: false },");
  lines.push("  },");
  lines.push("});");
  lines.push("");
  lines.push("const previewTransport: Transport = {");
  lines.push("  async call(req) {");
  lines.push("    if (req.capability === \"entity.query\") {");
  lines.push("      return { ok: true, data: [] };");
  lines.push("    }");
  lines.push("    if (req.capability === \"permissions.can\") {");
  lines.push("      return { ok: true, data: true };");
  lines.push("    }");
  lines.push("    return { ok: true, data: undefined };");
  lines.push("  },");
  lines.push("};");
  lines.push("");
  lines.push("const previewClient = createAppDomainClient({");
  lines.push("  transport: previewTransport,");
  lines.push(
    `  descriptor: { id: ${literal(compiled.manifest.metadata.id)}, manifestVersion: ${literal(compiled.manifest.metadata.version)} },`,
  );
  lines.push(`  surfaceId: ${literal(surface.id)},`);
  lines.push("  identity: { actorId: \"preview\", tenantId: \"org_456\", roles: [\"reviewer\"] },");
  lines.push("});");
  lines.push("");
  lines.push("export const Default = () => (");
  lines.push("  <QueryClientProvider client={queryClient}>");
  lines.push("    <AppDomainProvider client={previewClient}>");
  lines.push(`      <${componentName} />`);
  lines.push("    </AppDomainProvider>");
  lines.push("  </QueryClientProvider>");
  lines.push(");");
  lines.push("");
  lines.push("export default {");
  lines.push(`  title: ${literal(`App Domains/${compiled.manifest.metadata.id}/${surface.id}`)},`);
  lines.push("};");
  return `${lines.join("\n")}\n`;
}

function renderComposedSmokeTest(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const componentName = `${pascalCase(surface.id)}Surface`;
  return `import { describe, expect, it } from "vitest";

import * as surfaceModule from "./index";

describe(${literal(`${compiled.manifest.metadata.id}/${surface.id}`)}, () => {
  it("exports the composed surface component", () => {
    expect(typeof surfaceModule.${componentName}).toBe("function");
  });
});
`;
}

function requireSurfaceEntity(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): NormalizedEntity {
  const entity = resolveSurfaceEntity(compiled, surface);
  if (!entity) {
    throw new Error(`Unable to resolve entity for composed surface ${surface.id}`);
  }
  return entity;
}

function requireSurfaceQuery(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): { id: string; definition: CompiledManifest["manifest"]["queries"][string] } {
  const query = resolveSurfaceQuery(compiled, surface);
  if (!query) {
    throw new Error(`Unable to resolve query for composed surface ${surface.id}`);
  }
  return query;
}

function constantName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .toUpperCase();
}
