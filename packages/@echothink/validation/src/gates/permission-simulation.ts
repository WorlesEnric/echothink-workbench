import type { CompiledManifest } from "@echothink/domain-manifest";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
} from "./common.js";

export const permissionSimulationGate: Gate = {
  id: "permission-simulation",
  async run(ctx) {
    const createPreviewRuntime = await loadCreatePreviewRuntime();
    const personas = personasByRole(ctx.compiled.manifest.identity.roles.map((role) => role.id), ctx.compiled.manifest.identity.personas ?? []);
    const runtime = createPreviewRuntime({
      compiled: ctx.compiled,
      fixtures: {
        personas,
        entities: {},
        effectStubs: [],
      },
      activePersonaId: personas[0]?.id ?? "validation-empty",
      clock: { now: () => ctx.now },
      ids: {
        next(prefix = "id") {
          return `${prefix}_${ctx.runId}`;
        },
      },
      env: "preview",
    });

    const findings: GateFinding[] = [];
    const permissionRoles = permissionRoleMap(ctx.compiled.manifest.permissions);

    for (const surface of ctx.surfaces) {
      for (const persona of personas) {
        runtime.setPersona(persona.id);
        const expected =
          surface.requiredPermissions.length === 0 ||
          surface.requiredPermissions.every((permission) =>
            permissionRoles.get(permission)?.has(persona.role) ?? false,
          );
        const decisions = surface.requiredPermissions.map((permission) =>
          runtime.explainPermission("permission", permission),
        );
        const actual =
          surface.requiredPermissions.length === 0 ||
          decisions.every((decision) => decision.allowed);
        if (actual !== expected) {
          findings.push(
            errorFinding(
              "PERMISSION_SURFACE_MISMATCH",
              `Role "${persona.role}" ${actual ? "can" : "cannot"} load surface "${surface.id}", expected ${expected ? "allow" : "deny"} from requiredPermissions [${surface.requiredPermissions.join(", ")}].`,
            ),
          );
        }
      }
    }

    for (const process of ctx.compiled.normalizedProcesses) {
      for (const persona of personas) {
        runtime.setPersona(persona.id);
        const expected = process.requires?.permission
          ? permissionRoles.get(process.requires.permission)?.has(persona.role) ?? false
          : true;
        const decision = runtime.explainPermission("process.run", process.id);
        if (decision.allowed !== expected) {
          findings.push(
            errorFinding(
              "PERMISSION_PROCESS_MISMATCH",
              `Role "${persona.role}" ${decision.allowed ? "can" : "cannot"} run process "${process.id}", expected ${expected ? "allow" : "deny"} from the manifest permission declaration.`,
            ),
          );
        }
      }
    }

    return gateResult(this.id, findings);
  },
};

interface Persona {
  id: string;
  role: string;
  tenantId: string;
  label?: string;
}

interface PreviewRuntime {
  setPersona(id: string): void;
  explainPermission(capability: string, target: string): {
    allowed: boolean;
    reason: string;
  };
}

interface CreatePreviewRuntimeOptions {
  compiled: CompiledManifest;
  fixtures: {
    personas: readonly Persona[];
    entities: Record<string, readonly Record<string, unknown>[]>;
    effectStubs: readonly [];
  };
  activePersonaId: string;
  clock: { now(): string };
  ids: { next(prefix?: string): string };
  env: "preview";
}

type CreatePreviewRuntime = (
  opts: CreatePreviewRuntimeOptions,
) => PreviewRuntime;

async function loadCreatePreviewRuntime(): Promise<CreatePreviewRuntime> {
  const previewModule = (await import(
    new URL("../../../app-domain-runtime/dist/preview/index.js", import.meta.url)
      .href
  )) as {
    createPreviewRuntime?: unknown;
  };
  if (typeof previewModule.createPreviewRuntime !== "function") {
    throw new Error("Preview runtime module does not export createPreviewRuntime.");
  }
  return previewModule.createPreviewRuntime as CreatePreviewRuntime;
}

function personasByRole(
  roleIds: readonly string[],
  manifestPersonas: readonly {
    id: string;
    role: string;
    tenantId?: string;
    label?: string;
    invalid?: boolean;
  }[],
): Persona[] {
  return roleIds.map((role) => {
    const persona = manifestPersonas.find(
      (candidate) => candidate.role === role && candidate.invalid !== true,
    );
    return {
      id: persona?.id ?? `validation-${role}`,
      role,
      tenantId: persona?.tenantId ?? "org_456",
      ...(persona?.label ? { label: persona.label } : {}),
    };
  });
}

function permissionRoleMap(
  permissions: readonly { id: string; roles: readonly string[] }[],
): Map<string, Set<string>> {
  return new Map(
    permissions.map((permission) => [
      permission.id,
      new Set(permission.roles),
    ]),
  );
}
