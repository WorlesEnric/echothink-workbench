import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import {
  compileManifest as compileDomainManifest,
  generateKernel,
  parseManifestYaml,
  validateManifestSemantics,
  type AppDomainManifest,
  type CompiledManifest,
  type GeneratedFile,
  type SemanticDiagnostic,
} from "@echothink/domain-manifest";
import type {
  EffectStub,
  SdkRequest,
  SdkResponse,
} from "@echothink/app-domain-sdk";
import {
  createPreviewRuntime,
  type PreviewRuntime,
} from "@echothink/app-domain-runtime/preview";
import type { GateId, ValidationReport } from "@echothink/validation";
import { runPipeline } from "@echothink/validation";
import { generateDomain, writeDomain } from "@echothink/surface-factory";
import { uiRegistry } from "@echothink/ui-registry";
import {
  buildRegistryRecordFromCompiled,
  buildReleaseManifest,
  PromotionEngine,
  PromotionError,
  type RegistryRecord,
  type ReleaseApproval,
  type ReleaseManifest,
} from "@echothink/registry";
import {
  createCodexRunner,
  defaultDomainPolicy,
  runRepairLoop,
  type CodexRunner,
} from "@echothink/agent-harness";
import type {
  ApprovalRole,
  PromotionState,
  SdkCapability,
} from "@echothink/shared-types";
import { db } from "@/db";
import {
  appDomains,
  domainApprovals,
  domainReleases,
  domainValidationRuns,
  type AppDomain,
  type DomainRelease,
} from "@/db/schema";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { getUserDataPath } from "@/paths/paths";
import { createTypedHandler } from "./base";
import { echothinkContracts } from "../types/echothink";

const MANIFEST_FILE = "domain.manifest.yaml";
const DEFAULT_TENANT_ID = "preview-tenant";

interface DomainWorkspace {
  row: AppDomain;
  domainDir: string;
  manifestPath: string;
  manifestYaml: string;
}

interface CompiledDomain extends DomainWorkspace {
  manifest: AppDomainManifest;
  compiled: CompiledManifest;
  diagnostics: SemanticDiagnostic[];
}

interface PreviewSession {
  sessionId: string;
  domainId: string;
  runtime: PreviewRuntime;
  compiled: CompiledManifest;
  personas: PreviewPersona[];
  activePersonaId: string;
  surfaces: Array<Record<string, unknown>>;
}

interface PreviewPersona {
  id: string;
  role: string;
  tenantId: string;
  label?: string;
  invalid?: boolean;
}

const previewSessions = new Map<string, PreviewSession>();

export function registerEchothinkHandlers() {
  createTypedHandler(echothinkContracts.listDomains, async () => {
    return db.select().from(appDomains).all().map(domainSummaryFromRow);
  });

  createTypedHandler(echothinkContracts.getDomain, async (_, { domainId }) => {
    return domainDetailFromRow(await getDomainRowOrThrow(domainId));
  });

  createTypedHandler(
    echothinkContracts.createDomain,
    async (_, { id, name, owner, brief }) => {
      assertSafeDomainId(id);
      const existing = db
        .select()
        .from(appDomains)
        .where(eq(appDomains.id, id))
        .get();
      if (existing) {
        throw new DyadError(
          `App Domain "${id}" already exists.`,
          DyadErrorKind.Conflict,
        );
      }

      const domainDir = domainDirForId(id);
      await fs.mkdir(domainDir, { recursive: true });
      const manifestYaml = seedManifestYaml({ id, name, owner, brief });
      await fs.writeFile(
        path.join(domainDir, MANIFEST_FILE),
        manifestYaml,
        "utf8",
      );

      db.insert(appDomains)
        .values({
          id,
          name,
          owner: owner ?? null,
          brief: brief ?? null,
          manifestYaml,
          status: "draft",
          workspacePath: domainDir,
        })
        .run();

      return domainDetailFromRow(await getDomainRowOrThrow(id));
    },
  );

  createTypedHandler(
    echothinkContracts.deleteDomain,
    async (_, { domainId }) => {
      const row = await getDomainRowOrThrow(domainId);
      previewSessions.delete(domainId);
      db.delete(appDomains).where(eq(appDomains.id, domainId)).run();
      await fs.rm(domainDirForId(row.id), { recursive: true, force: true });
      return { ok: true as const };
    },
  );

  createTypedHandler(
    echothinkContracts.saveManifest,
    async (_, { domainId, yaml }) => {
      const workspace = await readDomainWorkspace(domainId, {
        allowMissingManifest: true,
      });
      await fs.mkdir(workspace.domainDir, { recursive: true });
      await fs.writeFile(workspace.manifestPath, yaml, "utf8");

      const parsed = parseAndDiagnose(yaml);
      const diagnostics = [...parsed.diagnostics];
      if (parsed.manifest && parsed.manifest.metadata.id !== domainId) {
        diagnostics.push({
          severity: "error",
          code: "DOMAIN_ID_MISMATCH",
          message: `Manifest id "${parsed.manifest.metadata.id}" does not match App Domain "${domainId}".`,
          path: "/metadata/id",
        });
      }

      const ok = !hasDiagnosticErrors(diagnostics);
      db.update(appDomains)
        .set({
          manifestYaml: yaml,
          ...(ok && parsed.manifest
            ? {
                name: parsed.manifest.metadata.name,
                owner: parsed.manifest.metadata.owner,
                brief: parsed.manifest.metadata.description ?? null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(appDomains.id, domainId))
        .run();

      previewSessions.delete(domainId);
      return { ok, diagnostics };
    },
  );

  createTypedHandler(
    echothinkContracts.compileManifest,
    async (_, { domainId }) => {
      const workspace = await readDomainWorkspace(domainId);
      const parsed = parseAndDiagnose(workspace.manifestYaml);
      if (!parsed.manifest || hasDiagnosticErrors(parsed.diagnostics)) {
        return emptyCompileResult(parsed.diagnostics);
      }

      const compiled = compileDomainManifest(parsed.manifest, {
        now: new Date().toISOString(),
      });
      await writeGeneratedFiles(workspace.domainDir, generateKernel(compiled));
      return {
        manifestDigest: compiled.manifestDigest,
        capabilityCounts: capabilityCounts(compiled),
        permissionMatrixRows: compiled.permissionMatrix,
        diagnostics: parsed.diagnostics,
      };
    },
  );

  createTypedHandler(
    echothinkContracts.generateArtifacts,
    async (_, { domainId }) => {
      const workspace = await readDomainWorkspace(domainId);
      try {
        const result = generateDomain(workspace.manifestYaml, {
          now: new Date().toISOString(),
        });
        writeDomain(workspace.domainDir, result);
        return { files: result.files.map((file) => file.path) };
      } catch (error) {
        throw asDyadError(error, DyadErrorKind.Validation);
      }
    },
  );

  createTypedHandler(
    echothinkContracts.runValidation,
    async (_, { domainId, gates }) => runAndPersistValidation(domainId, gates),
  );

  createTypedHandler(
    echothinkContracts.previewStart,
    async (_, { domainId, personaId }) => {
      const domain = await compileDomainOrThrow(domainId);
      const fixtures = await loadPreviewFixtures(domain);
      const activePersonaId = personaId ?? fixtures.personas[0]?.id;
      if (!activePersonaId) {
        throw new DyadError(
          `App Domain "${domainId}" has no preview personas.`,
          DyadErrorKind.Precondition,
        );
      }
      if (
        !fixtures.personas.some((persona) => persona.id === activePersonaId)
      ) {
        throw new DyadError(
          `Preview persona "${activePersonaId}" was not found.`,
          DyadErrorKind.NotFound,
        );
      }

      let idCounter = 0;
      const runtime = createPreviewRuntime({
        compiled: domain.compiled,
        fixtures,
        activePersonaId,
        clock: { now: () => new Date().toISOString() },
        ids: {
          next(prefix = "id") {
            idCounter += 1;
            return `${prefix}-${idCounter}`;
          },
        },
      });
      const surfaces = domain.compiled.surfaceRegistrations.map((surface) => ({
        ...surface,
      }));
      const session: PreviewSession = {
        sessionId: randomUUID(),
        domainId,
        runtime,
        compiled: domain.compiled,
        personas: fixtures.personas.map((persona) => ({ ...persona })),
        activePersonaId,
        surfaces,
      };
      previewSessions.set(domainId, session);

      return {
        sessionId: session.sessionId,
        personas: session.personas.map((persona) => ({ ...persona })),
        surfaces: session.surfaces,
      };
    },
  );

  createTypedHandler(
    echothinkContracts.previewRunProcess,
    async (_, { domainId, processId, input }) => {
      const session = getPreviewSession(domainId);
      return session.runtime.call(
        sdkRequest(session, "process.run", processId, input),
      );
    },
  );

  createTypedHandler(
    echothinkContracts.previewQuery,
    async (_, { domainId, queryId, args }) => {
      const session = getPreviewSession(domainId);
      const response = await session.runtime.call(
        sdkRequest(session, "entity.query", queryId, args),
      );
      return rowsFromSdkResponse(response, `Query "${queryId}" failed.`);
    },
  );

  createTypedHandler(
    echothinkContracts.previewExplainPermission,
    async (_, { domainId, capability, target }) => {
      const decision = getPreviewSession(domainId).runtime.explainPermission(
        capability,
        target,
      );
      return {
        allowed: decision.allowed,
        reason: decision.reason,
      };
    },
  );

  createTypedHandler(
    echothinkContracts.previewSetPersona,
    async (_, { domainId, personaId }) => {
      const session = getPreviewSession(domainId);
      session.runtime.setPersona(personaId);
      session.activePersonaId = personaId;
      return { ok: true as const };
    },
  );

  createTypedHandler(
    echothinkContracts.previewInspect,
    async (_, { domainId }) => {
      const runtime = getPreviewSession(domainId).runtime;
      return {
        audit: runtime.inspectAudit().map((record) => ({ ...record })),
        events: runtime.inspectEvents().map((event) => ({ ...event })),
      };
    },
  );

  createTypedHandler(
    echothinkContracts.previewForceFailure,
    async (_, { domainId, kind }) => {
      getPreviewSession(domainId).runtime.forceFailure(kind);
      return { ok: true as const };
    },
  );

  createTypedHandler(
    echothinkContracts.uiRegistrySearch,
    async (_, { text, kind, surfaceType }) => {
      return toIpcJson(uiRegistry.search({ text, kind, surfaceType }));
    },
  );

  createTypedHandler(echothinkContracts.uiRegistryList, async () => {
    return toIpcJson({
      components: uiRegistry.components,
      blocks: uiRegistry.blocks,
      pageTemplates: uiRegistry.pageTemplates,
      recipes: uiRegistry.recipes,
    }) as any;
  });

  createTypedHandler(echothinkContracts.registryList, async () => {
    const rows = db.select().from(appDomains).all();
    return Promise.all(rows.map(registryRecordFromRow));
  });

  createTypedHandler(
    echothinkContracts.registryGet,
    async (_, { domainId }) => {
      const row = db
        .select()
        .from(appDomains)
        .where(eq(appDomains.id, domainId))
        .get();
      return row ? registryRecordFromRow(row) : null;
    },
  );

  createTypedHandler(
    echothinkContracts.buildRelease,
    async (_, { domainId }) => {
      const domain = await compileDomainOrThrow(domainId);
      const surfaceFiles = await collectSurfaceFiles(
        domain.domainDir,
        domain.compiled,
      );
      const version = domain.compiled.manifest.metadata.version;
      const approvals = approvalsForDomainVersion(domainId, version);
      const release = withApprovals(
        buildReleaseManifest({
          compiled: domain.compiled,
          gitCommit: process.env.GIT_COMMIT ?? "workspace-local",
          surfaceFiles,
          sdkContractVersion:
            domain.compiled.manifest.metadata.sdkContractVersion,
          runtimeCompatibility:
            domain.compiled.manifest.metadata.sdkContractVersion,
          validationReport: latestValidationReportPath(domainId),
          effects: effectVersions(domain.compiled.manifest),
          ...(domain.row.activeVersion
            ? { previousVersion: domain.row.activeVersion }
            : {}),
        }),
        approvals,
      );
      persistRelease(domainId, release, "release-candidate");
      return release;
    },
  );

  createTypedHandler(
    echothinkContracts.promote,
    async (_, { domainId, to, evidence }) => {
      const row = await getDomainRowOrThrow(domainId);
      const record = await registryRecordFromRow(row);
      const release = evidence?.release ?? latestReleaseForDomain(domainId);
      const engine = new PromotionEngine();
      let next: RegistryRecord;
      try {
        next = engine.transition(record, to, {
          ...evidence,
          ...(release ? { release } : {}),
        });
      } catch (error) {
        if (error instanceof PromotionError) {
          throw new DyadError(error.message, DyadErrorKind.Precondition);
        }
        throw error;
      }

      db.update(appDomains)
        .set({
          status: next.status,
          activeVersion:
            next.activeVersion ?? release?.version ?? row.activeVersion,
          updatedAt: new Date(),
        })
        .where(eq(appDomains.id, domainId))
        .run();

      if (release) {
        updateReleaseState(domainId, release.version, to);
      }

      return registryRecordFromRow(await getDomainRowOrThrow(domainId));
    },
  );

  createTypedHandler(
    echothinkContracts.recordApproval,
    async (_, { domainId, version, role, user }) => {
      await getDomainRowOrThrow(domainId);
      const now = new Date();
      db.insert(domainApprovals)
        .values({
          domainId,
          version,
          role,
          user,
          approvedAt: now,
        })
        .run();
      appendApprovalToRelease(domainId, version, {
        role,
        user,
        timestamp: now.toISOString(),
      });
      return { ok: true as const };
    },
  );

  createTypedHandler(
    echothinkContracts.harnessRun,
    async (_, { domainId, prompt, surfaceId, maxIterations }) => {
      const workspace = await readDomainWorkspace(domainId);
      const blockedActions: string[] = [];
      const baseRunner = createCodexRunner();
      const runner: CodexRunner = {
        async run(task) {
          const result = await baseRunner.run(task);
          blockedActions.push(...result.blockedActions);
          return result;
        },
      };
      const result = await runRepairLoop({
        runner,
        validate: () => runAndPersistValidation(domainId),
        task: {
          prompt: surfaceId
            ? `${prompt}\n\nTarget surface: ${surfaceId}`
            : prompt,
          cwd: workspace.domainDir,
          policy: defaultDomainPolicy(workspace.domainDir),
          runId: `harness-${randomUUID()}`,
        },
        maxIterations: maxIterations ?? 3,
      });

      return {
        ok: result.report.overall === "pass" && blockedActions.length === 0,
        report: result.report,
        iterations: result.iterations,
        blockedActions,
      };
    },
  );
}

function domainSummaryFromRow(row: AppDomain) {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner ?? null,
    brief: row.brief ?? null,
    status: row.status,
    activeVersion: row.activeVersion ?? null,
    workspacePath: row.workspacePath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function domainDetailFromRow(row: AppDomain) {
  return {
    ...domainSummaryFromRow(row),
    manifestYaml: await readManifestYamlForRow(row),
    lastValidation: lastValidationSummary(row.id),
  };
}

async function getDomainRowOrThrow(domainId: string): Promise<AppDomain> {
  assertSafeDomainId(domainId);
  const row = db
    .select()
    .from(appDomains)
    .where(eq(appDomains.id, domainId))
    .get();
  if (!row) {
    throw new DyadError(
      `App Domain "${domainId}" was not found.`,
      DyadErrorKind.NotFound,
    );
  }
  return row;
}

async function readDomainWorkspace(
  domainId: string,
  opts: { allowMissingManifest?: boolean } = {},
): Promise<DomainWorkspace> {
  const row = await getDomainRowOrThrow(domainId);
  const domainDir = domainDirForId(domainId);
  const manifestPath = path.join(domainDir, MANIFEST_FILE);
  let manifestYaml: string;
  try {
    manifestYaml = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    if (
      opts.allowMissingManifest &&
      isNodeError(error) &&
      error.code === "ENOENT"
    ) {
      manifestYaml = row.manifestYaml ?? "";
    } else if (isNodeError(error) && error.code === "ENOENT") {
      throw new DyadError(
        `Manifest file was not found for App Domain "${domainId}".`,
        DyadErrorKind.NotFound,
      );
    } else {
      throw error;
    }
  }
  return { row, domainDir, manifestPath, manifestYaml };
}

async function compileDomainOrThrow(domainId: string): Promise<CompiledDomain> {
  const workspace = await readDomainWorkspace(domainId);
  const parsed = parseAndDiagnose(workspace.manifestYaml);
  if (!parsed.manifest || hasDiagnosticErrors(parsed.diagnostics)) {
    throw new DyadError(
      diagnosticsMessage(parsed.diagnostics),
      DyadErrorKind.Validation,
    );
  }
  const compiled = compileDomainManifest(parsed.manifest, {
    now: new Date().toISOString(),
  });
  await writeGeneratedFiles(workspace.domainDir, generateKernel(compiled));
  return {
    ...workspace,
    manifest: parsed.manifest,
    compiled,
    diagnostics: parsed.diagnostics,
  };
}

async function runAndPersistValidation(
  domainId: string,
  gates?: GateId[],
): Promise<ValidationReport> {
  const domain = await compileDomainOrThrow(domainId);
  const runId = `validation-${randomUUID()}`;
  const now = new Date().toISOString();
  const report = await runPipeline(
    {
      domainDir: domain.domainDir,
      compiled: domain.compiled,
      surfaces: domain.compiled.surfaceRegistrations,
      runId,
      now,
    },
    gates,
  );

  db.insert(domainValidationRuns)
    .values({
      domainId,
      runId: report.runId,
      overall: report.overall,
      reportJson: JSON.stringify(report),
    })
    .run();

  await writeValidationReport(domain.domainDir, report);
  return report;
}

function parseAndDiagnose(manifestYaml: string): {
  manifest?: AppDomainManifest;
  diagnostics: SemanticDiagnostic[];
} {
  try {
    const { manifest } = parseManifestYaml(manifestYaml);
    return {
      manifest,
      diagnostics: validateManifestSemantics(manifest),
    };
  } catch (error) {
    return { diagnostics: diagnosticsFromParseError(error) };
  }
}

function diagnosticsFromParseError(error: unknown): SemanticDiagnostic[] {
  const issues =
    isRecord(error) && Array.isArray(error.issues) ? error.issues : undefined;
  if (issues) {
    return issues.map((issue, index) => {
      const record = isRecord(issue) ? issue : {};
      const pathSegments = Array.isArray(record.path) ? record.path : [];
      return {
        severity: "error",
        code: "MANIFEST_PARSE_ERROR",
        message:
          typeof record.message === "string"
            ? record.message
            : "Invalid App-Domain manifest.",
        path:
          pathSegments.length > 0
            ? `/${pathSegments.map(String).join("/")}`
            : `/${String(index)}`,
      };
    });
  }

  return [
    {
      severity: "error",
      code: "MANIFEST_PARSE_ERROR",
      message:
        error instanceof Error ? error.message : "Invalid manifest YAML.",
      path: "/",
    },
  ];
}

function hasDiagnosticErrors(
  diagnostics: readonly SemanticDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function diagnosticsMessage(
  diagnostics: readonly SemanticDiagnostic[],
): string {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length === 0) {
    return "App-Domain manifest failed validation.";
  }
  return errors
    .slice(0, 5)
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("; ");
}

function emptyCompileResult(diagnostics: SemanticDiagnostic[]) {
  return {
    manifestDigest: "",
    capabilityCounts: {
      entities: 0,
      queries: 0,
      processes: 0,
      events: 0,
      effects: 0,
    },
    permissionMatrixRows: [],
    diagnostics,
  };
}

function capabilityCounts(compiled: CompiledManifest) {
  return {
    entities: compiled.capabilityMap.entities.length,
    queries: compiled.capabilityMap.queries.length,
    processes: compiled.capabilityMap.processes.length,
    events: compiled.capabilityMap.events.length,
    effects: compiled.capabilityMap.effects.length,
  };
}

async function writeGeneratedFiles(
  domainDir: string,
  files: readonly GeneratedFile[],
): Promise<void> {
  const root = path.resolve(domainDir);
  for (const file of files) {
    const target = resolveGeneratedPath(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.contents, "utf8");
  }
}

function resolveGeneratedPath(root: string, relPath: string): string {
  if (path.isAbsolute(relPath)) {
    throw new DyadError(
      `Generated file path must be relative: ${relPath}`,
      DyadErrorKind.Validation,
    );
  }
  const target = path.resolve(root, relPath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DyadError(
      `Generated file path escapes the App Domain workspace: ${relPath}`,
      DyadErrorKind.Validation,
    );
  }
  return target;
}

async function writeValidationReport(
  domainDir: string,
  report: ValidationReport,
): Promise<void> {
  const reportPath = resolveGeneratedPath(
    path.resolve(domainDir),
    validationReportPath(report.runId),
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

async function readManifestYamlForRow(row: AppDomain): Promise<string | null> {
  try {
    return await fs.readFile(
      path.join(domainDirForId(row.id), MANIFEST_FILE),
      "utf8",
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return row.manifestYaml ?? null;
    }
    throw error;
  }
}

function lastValidationSummary(domainId: string) {
  const row = db
    .select()
    .from(domainValidationRuns)
    .where(eq(domainValidationRuns.domainId, domainId))
    .orderBy(desc(domainValidationRuns.createdAt))
    .get();
  if (!row) {
    return null;
  }
  const report = parseJson<ValidationReport>(row.reportJson);
  return {
    runId: row.runId,
    overall: row.overall,
    gateCount: report?.gates.length ?? 0,
    errorCount:
      report?.gates.reduce(
        (count, gate) =>
          count +
          gate.findings.filter((finding) => finding.severity === "error")
            .length,
        0,
      ) ?? 0,
    createdAt: row.createdAt,
  };
}

function getDomainWorkspaceRoot(): string {
  return path.join(getUserDataPath(), "echothink", "domains");
}

function domainDirForId(domainId: string): string {
  assertSafeDomainId(domainId);
  return path.join(getDomainWorkspaceRoot(), domainId);
}

function assertSafeDomainId(domainId: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(domainId)) {
    throw new DyadError(
      "App Domain id must be kebab-case.",
      DyadErrorKind.Validation,
    );
  }
}

function seedManifestYaml(input: {
  id: string;
  name: string;
  owner?: string;
  brief?: string;
}): string {
  const owner = input.owner ?? "domain-owner";
  const description = input.brief
    ? `  description: ${JSON.stringify(input.brief)}\n`
    : "";
  return `apiVersion: echothink.ai/v1
kind: AppDomain

metadata:
  id: ${input.id}
  name: ${JSON.stringify(input.name)}
  owner: ${JSON.stringify(owner)}
  version: 0.1.0
  sdkContractVersion: "1.0"
  uiRegistryVersion: "2026.05"
${description}identity:
  roles:
    - id: owner
      name: Owner
      assignable: true
  personas:
    - id: owner
      role: owner
      tenantId: ${DEFAULT_TENANT_ID}
      label: Owner

entities: {}
queries: {}
permissions: []
unitProcesses: {}
events: {}
effects: {}
surfaces: []

release:
  channel: candidate
  requiredApprovals:
    - domain-owner
`;
}

async function loadPreviewFixtures(domain: CompiledDomain): Promise<{
  personas: PreviewPersona[];
  entities: Record<string, Record<string, unknown>[]>;
  effectStubs: EffectStub<unknown, unknown>[];
}> {
  const fixturesDir = path.join(domain.domainDir, "fixtures");
  return {
    personas: await loadPersonas(fixturesDir, domain.compiled),
    entities: await loadEntities(fixturesDir, domain.compiled),
    effectStubs: await loadEffectStubs(fixturesDir, domain.compiled),
  };
}

async function loadPersonas(
  fixturesDir: string,
  compiled: CompiledManifest,
): Promise<PreviewPersona[]> {
  const fixture = await readFixture(fixturesDir, [
    "personas.json",
    "personas.yaml",
    "personas.yml",
  ]);
  const rawPersonas = Array.isArray(fixture)
    ? fixture
    : isRecord(fixture) && Array.isArray(fixture.personas)
      ? fixture.personas
      : (compiled.manifest.identity.personas ?? []);
  const personas = rawPersonas
    .filter(isRecord)
    .map((persona) => normalizePersona(persona))
    .filter((persona): persona is PreviewPersona => persona !== null);
  if (personas.length > 0) {
    return personas;
  }
  const role = compiled.manifest.identity.roles[0]?.id ?? "owner";
  return [
    {
      id: role,
      role,
      tenantId: DEFAULT_TENANT_ID,
      label: role,
    },
  ];
}

function normalizePersona(
  input: Record<string, unknown>,
): PreviewPersona | null {
  if (typeof input.id !== "string" || typeof input.role !== "string") {
    return null;
  }
  return {
    id: input.id,
    role: input.role,
    tenantId:
      typeof input.tenantId === "string" ? input.tenantId : DEFAULT_TENANT_ID,
    ...(typeof input.label === "string" ? { label: input.label } : {}),
    ...(typeof input.invalid === "boolean" ? { invalid: input.invalid } : {}),
  };
}

async function loadEntities(
  fixturesDir: string,
  compiled: CompiledManifest,
): Promise<Record<string, Record<string, unknown>[]>> {
  const fixture = await readFixture(fixturesDir, [
    "sample-entities.json",
    "sample-entities.yaml",
    "sample-entities.yml",
    "entities.json",
    "entities.yaml",
    "entities.yml",
  ]);
  if (isRecord(fixture)) {
    const entities: Record<string, Record<string, unknown>[]> = {};
    for (const [entityName, rows] of Object.entries(fixture)) {
      if (Array.isArray(rows)) {
        entities[entityName] = rows.filter(isRecord).map((row) => ({ ...row }));
      }
    }
    if (Object.keys(entities).length > 0) {
      return entities;
    }
  }
  return synthesizeEntities(compiled);
}

function synthesizeEntities(
  compiled: CompiledManifest,
): Record<string, Record<string, unknown>[]> {
  const entities: Record<string, Record<string, unknown>[]> = {};
  const now = new Date().toISOString();
  for (const entity of compiled.normalizedEntities) {
    const row: Record<string, unknown> = {
      id: `${entity.key}-1`,
    };
    if (entity.tenantScope === "organization") {
      row.tenantId = DEFAULT_TENANT_ID;
    }
    for (const field of entity.fields) {
      if (field.name in row) {
        continue;
      }
      if (entity.stateField === field.name && entity.stateMachine?.initial) {
        row[field.name] = entity.stateMachine.initial;
      } else if (field.optional) {
        row[field.name] = null;
      } else if (field.arrayOf) {
        row[field.name] = [];
      } else if (field.kind === "date") {
        row[field.name] = now;
      } else if (field.kind === "number") {
        row[field.name] = 0;
      } else if (field.kind === "boolean") {
        row[field.name] = false;
      } else if (field.kind === "json") {
        row[field.name] = {};
      } else if (field.kind === "enum") {
        row[field.name] = field.enumValues?.[0] ?? "sample";
      } else {
        row[field.name] = `${field.name}-sample`;
      }
    }
    entities[entity.name] = [row];
  }
  return entities;
}

async function loadEffectStubs(
  fixturesDir: string,
  compiled: CompiledManifest,
): Promise<EffectStub<unknown, unknown>[]> {
  const fixture = await readFixture(fixturesDir, [
    "effect-stubs.json",
    "effect-stubs.yaml",
    "effect-stubs.yml",
  ]);
  const rawStubs = Array.isArray(fixture)
    ? fixture
    : isRecord(fixture) && Array.isArray(fixture.effects)
      ? fixture.effects
      : [];
  const stubs = new Map<string, EffectStub<unknown, unknown>>();
  for (const rawStub of rawStubs.filter(isRecord)) {
    const id = typeof rawStub.id === "string" ? rawStub.id : undefined;
    if (!id) continue;
    const output = isRecord(rawStub.output) ? rawStub.output : { ok: true };
    stubs.set(id, {
      id,
      async stub() {
        return cloneJson(output);
      },
    });
  }

  for (const effectId of Object.keys(compiled.manifest.effects)) {
    if (!stubs.has(effectId)) {
      stubs.set(effectId, {
        id: effectId,
        async stub() {
          return { ok: true };
        },
      });
    }
  }

  return [...stubs.values()];
}

async function readFixture(
  fixturesDir: string,
  candidates: readonly string[],
): Promise<unknown> {
  for (const candidate of candidates) {
    const filePath = path.join(fixturesDir, candidate);
    const text = await readOptionalText(filePath);
    if (text === null) {
      continue;
    }
    try {
      if (candidate.endsWith(".json")) {
        return JSON.parse(text) as unknown;
      }
      return parseSimpleYamlFixture(text);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseSimpleYamlFixture(text: string): unknown {
  const lines = text.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  let rootListKey: string | undefined;
  let current: Record<string, unknown> | undefined;
  let nestedKey: string | undefined;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const rootKey = /^([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (rootKey?.[1]) {
      rootListKey = rootKey[1];
      root[rootListKey] = [];
      current = undefined;
      nestedKey = undefined;
      continue;
    }

    const listItem = /^\s*-\s*([A-Za-z0-9_.-]+):\s*(.+)$/.exec(line);
    if (listItem?.[1] && rootListKey) {
      current = {
        [listItem[1]]: parseFixtureScalar(listItem[2] ?? ""),
      };
      (root[rootListKey] as Record<string, unknown>[]).push(current);
      nestedKey = undefined;
      continue;
    }

    const field = /^\s{4}([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (field?.[1] && current) {
      const value = field[2] ?? "";
      if (value.trim() === "") {
        nestedKey = field[1];
        current[nestedKey] = {};
      } else {
        current[field[1]] = parseFixtureScalar(value);
        nestedKey = undefined;
      }
      continue;
    }

    const nestedField = /^\s{6}([A-Za-z0-9_.-]+):\s*(.+)$/.exec(line);
    if (nestedField?.[1] && current && nestedKey) {
      const nested = current[nestedKey];
      if (isRecord(nested)) {
        nested[nestedField[1]] = parseFixtureScalar(nestedField[2] ?? "");
      }
    }
  }

  return rootListKey ? root : undefined;
}

function parseFixtureScalar(raw: string): unknown {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function getPreviewSession(domainId: string): PreviewSession {
  const session = previewSessions.get(domainId);
  if (!session) {
    throw new DyadError(
      `Preview has not been started for App Domain "${domainId}".`,
      DyadErrorKind.Precondition,
    );
  }
  return session;
}

function sdkRequest(
  session: PreviewSession,
  capability: SdkCapability,
  target: string,
  input?: unknown,
): SdkRequest {
  const persona = session.personas.find(
    (candidate) => candidate.id === session.activePersonaId,
  );
  return {
    domainId: session.domainId,
    manifestVersion: session.compiled.manifest.metadata.version,
    surfaceId:
      typeof session.surfaces[0]?.id === "string"
        ? session.surfaces[0].id
        : "workbench-preview",
    actorId: persona?.id ?? "preview-user",
    tenantId: persona?.tenantId ?? DEFAULT_TENANT_ID,
    capability,
    target,
    input,
  };
}

function rowsFromSdkResponse(
  response: SdkResponse,
  fallbackMessage: string,
): Record<string, unknown>[] {
  if (!response.ok) {
    throw new DyadError(
      `${fallbackMessage} ${response.error.message}`,
      DyadErrorKind.Precondition,
    );
  }
  if (!Array.isArray(response.data) || !response.data.every(isRecord)) {
    throw new DyadError(
      "Preview query did not return row objects.",
      DyadErrorKind.Internal,
    );
  }
  return response.data.map((row) => ({ ...row }));
}

async function registryRecordFromRow(row: AppDomain): Promise<RegistryRecord> {
  const workspace = await readDomainWorkspace(row.id);
  const parsed = parseAndDiagnose(workspace.manifestYaml);
  const releases = releaseRowsForDomain(row.id);
  const approvals = approvalsForDomain(row.id);
  if (!parsed.manifest || hasDiagnosticErrors(parsed.diagnostics)) {
    return {
      domainId: row.id,
      name: row.name,
      owner: row.owner ?? "domain-owner",
      status: row.status,
      versions: releases.map((release) => release.version),
      ...(row.activeVersion ? { activeVersion: row.activeVersion } : {}),
      surfaces: [],
      capabilities: [],
      approvals: approvalRecord(approvals),
      sdkContractVersion: "unknown",
      runtimeCompatibility: "unknown",
      ...latestReleaseFromRows(releases, row.id),
    };
  }

  const compiled = compileDomainManifest(parsed.manifest, {
    now: new Date().toISOString(),
  });
  const latestRelease = latestReleaseFromRows(releases, row.id);
  return {
    ...buildRegistryRecordFromCompiled(compiled, {
      owner: row.owner ?? parsed.manifest.metadata.owner,
      status: row.status,
      runtimeCompatibility: compiled.manifest.metadata.sdkContractVersion,
    }),
    versions:
      releases.length > 0
        ? releases.map((release) => release.version)
        : [compiled.manifest.metadata.version],
    ...(row.activeVersion ? { activeVersion: row.activeVersion } : {}),
    approvals: approvalRecord(approvals),
    ...(latestRelease ? { release: latestRelease.release } : {}),
    ...(releases.length > 0
      ? {
          releases: Object.fromEntries(
            releases.map((releaseRow) => [
              releaseRow.version,
              releaseFromRow(releaseRow, row.id),
            ]),
          ),
        }
      : {}),
  };
}

function releaseRowsForDomain(domainId: string): DomainRelease[] {
  return db
    .select()
    .from(domainReleases)
    .where(eq(domainReleases.domainId, domainId))
    .orderBy(desc(domainReleases.createdAt))
    .all();
}

function approvalsForDomain(domainId: string) {
  return db
    .select()
    .from(domainApprovals)
    .where(eq(domainApprovals.domainId, domainId))
    .all();
}

function approvalsForDomainVersion(
  domainId: string,
  version: string,
): ReleaseApproval[] {
  return db
    .select()
    .from(domainApprovals)
    .where(
      and(
        eq(domainApprovals.domainId, domainId),
        eq(domainApprovals.version, version),
      ),
    )
    .all()
    .map((approval) => ({
      role: approval.role,
      user: approval.user,
      timestamp: approval.approvedAt.toISOString(),
    }));
}

function approvalRecord(
  approvals: Array<{ role: ApprovalRole }>,
): Record<string, boolean> {
  return Object.fromEntries(approvals.map((approval) => [approval.role, true]));
}

function latestReleaseForDomain(domainId: string): ReleaseManifest | undefined {
  const row = releaseRowsForDomain(domainId)[0];
  return row ? releaseFromRow(row, domainId) : undefined;
}

function latestReleaseFromRows(
  rows: readonly DomainRelease[],
  domainId: string,
): { release: ReleaseManifest } | undefined {
  const row = rows[0];
  return row ? { release: releaseFromRow(row, domainId) } : undefined;
}

function releaseFromRow(row: DomainRelease, domainId: string): ReleaseManifest {
  const release = parseJson<ReleaseManifest>(row.releaseManifestJson);
  if (!release) {
    throw new DyadError(
      `Release manifest for "${domainId}" ${row.version} is invalid.`,
      DyadErrorKind.Internal,
    );
  }
  return withApprovals(
    release,
    approvalsForDomainVersion(domainId, row.version),
  );
}

function withApprovals(
  release: ReleaseManifest,
  approvals: ReleaseApproval[],
): ReleaseManifest {
  const byRole = new Map<string, ReleaseApproval>();
  for (const approval of [...release.approvals, ...approvals]) {
    byRole.set(approval.role, approval);
  }
  return {
    ...release,
    approvals: [...byRole.values()].sort((left, right) =>
      left.role.localeCompare(right.role),
    ),
  };
}

function persistRelease(
  domainId: string,
  release: ReleaseManifest,
  state: PromotionState,
): void {
  const existing = db
    .select()
    .from(domainReleases)
    .where(
      and(
        eq(domainReleases.domainId, domainId),
        eq(domainReleases.version, release.version),
      ),
    )
    .get();
  if (existing) {
    db.update(domainReleases)
      .set({
        state,
        releaseManifestJson: JSON.stringify(release),
      })
      .where(eq(domainReleases.id, existing.id))
      .run();
  } else {
    db.insert(domainReleases)
      .values({
        domainId,
        version: release.version,
        state,
        releaseManifestJson: JSON.stringify(release),
      })
      .run();
  }
}

function updateReleaseState(
  domainId: string,
  version: string,
  state: PromotionState,
): void {
  db.update(domainReleases)
    .set({ state })
    .where(
      and(
        eq(domainReleases.domainId, domainId),
        eq(domainReleases.version, version),
      ),
    )
    .run();
}

function appendApprovalToRelease(
  domainId: string,
  version: string,
  approval: ReleaseApproval,
): void {
  const row = db
    .select()
    .from(domainReleases)
    .where(
      and(
        eq(domainReleases.domainId, domainId),
        eq(domainReleases.version, version),
      ),
    )
    .get();
  if (!row) {
    return;
  }
  const release = withApprovals(releaseFromRow(row, domainId), [approval]);
  db.update(domainReleases)
    .set({ releaseManifestJson: JSON.stringify(release) })
    .where(eq(domainReleases.id, row.id))
    .run();
}

async function collectSurfaceFiles(
  domainDir: string,
  compiled: CompiledManifest,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const surface of compiled.surfaceRegistrations) {
    const candidates = [
      surface.entry,
      `surfaces/standard/${surface.id}.surface.yaml`,
      `surfaces/composed/${surface.id}/index.tsx`,
      `surfaces/custom/${surface.id}/index.tsx`,
    ].filter((candidate): candidate is string => Boolean(candidate));
    let contents: string | null = null;
    for (const candidate of candidates) {
      contents = await readOptionalText(path.join(domainDir, candidate));
      if (contents !== null) {
        break;
      }
    }
    files[surface.id] = contents ?? JSON.stringify(surface);
  }
  return files;
}

function latestValidationReportPath(domainId: string): string {
  const row = db
    .select()
    .from(domainValidationRuns)
    .where(eq(domainValidationRuns.domainId, domainId))
    .orderBy(desc(domainValidationRuns.createdAt))
    .get();
  return row ? validationReportPath(row.runId) : "validation/not-run.json";
}

function validationReportPath(runId: string): string {
  return `validation/${runId}.json`;
}

function effectVersions(
  manifest: AppDomainManifest,
): Record<string, string> | undefined {
  const entries = Object.entries(manifest.effects).map(([effectId, effect]) => [
    effectId,
    effect.version ?? "0.0.0",
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function toIpcJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, child) =>
      typeof child === "function" ? undefined : child,
    ),
  ) as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function asDyadError(error: unknown, kind: DyadErrorKind): Error {
  if (error instanceof DyadError) {
    return error;
  }
  return new DyadError(
    error instanceof Error ? error.message : "Echothink operation failed.",
    kind,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
