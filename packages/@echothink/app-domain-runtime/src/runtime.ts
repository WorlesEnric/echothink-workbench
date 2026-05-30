import type {
  EffectImpl,
  IdentityContext,
  SdkRequest,
  SdkResponse,
  Transport,
} from "@echothink/app-domain-sdk";
import type { CompiledManifest, Persona as ManifestPersona } from "@echothink/domain-manifest";
import type { Environment } from "@echothink/shared-types";

import type {
  AuditSink,
  Clock,
  EntityStore,
  IdGenerator,
  IdentityContextResolver,
  RuntimeContext,
  SecretResolver,
} from "./adapters.js";
import { sdkError, toSdkError } from "./errors.js";
import {
  DefaultAuditEngine,
  type AuditEngine,
} from "./engines/audit.js";
import {
  DefaultEffectInvoker,
  type EffectInvoker,
} from "./engines/effects.js";
import {
  DefaultEntityGateway,
  type EntityGateway,
} from "./engines/entities.js";
import {
  InMemoryDomainEventBus,
  type DomainEventBus,
} from "./engines/events.js";
import {
  ManifestPermissionEngine,
  type PermissionEngine,
} from "./engines/permissions.js";
import {
  DefaultUnitProcessEngine,
  type UnitProcessEngine,
} from "./engines/processes.js";
import {
  DefaultStateMachineEvaluator,
  type StateMachineEvaluator,
} from "./engines/state-machine.js";
import {
  DefaultReleaseGuard,
  type ReleaseGuard,
  type ReleaseManifestLike,
} from "./release-guard.js";

export interface RuntimePersona {
  id: string;
  role?: string;
  roles?: readonly string[];
  tenantId?: string;
}

export type RuntimeRoleMap = Record<
  string,
  | string
  | readonly string[]
  | { role?: string; roles?: readonly string[]; tenantId?: string }
>;

export interface CreateRuntimeOptions {
  compiled: CompiledManifest;
  release?: ReleaseManifestLike;
  entityStore: EntityStore;
  auditSink: AuditSink;
  secretResolver: SecretResolver;
  effects: readonly EffectImpl<unknown, unknown>[];
  clock: Clock;
  ids: IdGenerator;
  env?: Environment;
  identityResolver?: IdentityContextResolver;
  personas?: readonly RuntimePersona[];
  roleMap?: RuntimeRoleMap;
}

export interface DomainRuntime extends Transport {
  getPermissionEngine(): PermissionEngine;
  getEntityGateway(): EntityGateway;
  getStateMachineEvaluator(): StateMachineEvaluator;
  getUnitProcessEngine(): UnitProcessEngine;
  getEventBus(): DomainEventBus;
  getAuditEngine(): AuditEngine;
  getEffectInvoker(): EffectInvoker;
  getReleaseGuard(): ReleaseGuard;
}

export function createRuntime(opts: CreateRuntimeOptions): DomainRuntime {
  return new DefaultDomainRuntime(opts);
}

class DefaultDomainRuntime implements DomainRuntime {
  private readonly releaseGuard: ReleaseGuard;
  private readonly permissionEngine: PermissionEngine;
  private readonly auditEngine: AuditEngine;
  private readonly entityGateway: EntityGateway;
  private readonly stateMachine: StateMachineEvaluator;
  private readonly eventBus: DomainEventBus;
  private readonly effectInvoker: EffectInvoker;
  private readonly processEngine: UnitProcessEngine;
  private readonly identityResolver: IdentityContextResolver;
  private readonly env: Environment;

  constructor(private readonly opts: CreateRuntimeOptions) {
    this.env = opts.env ?? "production";
    this.releaseGuard = new DefaultReleaseGuard(opts.compiled);
    this.permissionEngine = new ManifestPermissionEngine(
      opts.compiled.permissionMatrix,
    );
    this.auditEngine = new DefaultAuditEngine(opts.auditSink);
    this.stateMachine = new DefaultStateMachineEvaluator();
    this.eventBus = new InMemoryDomainEventBus();
    this.identityResolver =
      opts.identityResolver ??
      createDefaultIdentityResolver(opts.compiled, {
        personas: opts.personas,
        roleMap: opts.roleMap,
      });
    this.effectInvoker = new DefaultEffectInvoker(
      opts.compiled,
      opts.effects,
      this.permissionEngine,
      opts.secretResolver,
    );
    this.entityGateway = new DefaultEntityGateway(
      opts.compiled,
      opts.entityStore,
      this.permissionEngine,
      this.auditEngine,
      opts.clock,
      opts.ids,
    );
    this.processEngine = new DefaultUnitProcessEngine(
      opts.compiled,
      opts.entityStore,
      this.entityGateway,
      this.permissionEngine,
      this.stateMachine,
      this.effectInvoker,
      this.eventBus,
      this.auditEngine,
      opts.clock,
      opts.ids,
    );
  }

  async call(req: SdkRequest): Promise<SdkResponse> {
    const releaseResult = this.releaseGuard.verify(req, this.opts.release);
    if (!releaseResult.ok) {
      return {
        ok: false,
        error: {
          kind: "release_guard",
          message: "Release guard rejected the SDK request.",
          details: releaseResult.problems,
        },
      };
    }

    try {
      const data = await this.dispatch(req);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toSdkError(error) };
    }
  }

  getPermissionEngine(): PermissionEngine {
    return this.permissionEngine;
  }

  getEntityGateway(): EntityGateway {
    return this.entityGateway;
  }

  getStateMachineEvaluator(): StateMachineEvaluator {
    return this.stateMachine;
  }

  getUnitProcessEngine(): UnitProcessEngine {
    return this.processEngine;
  }

  getEventBus(): DomainEventBus {
    return this.eventBus;
  }

  getAuditEngine(): AuditEngine {
    return this.auditEngine;
  }

  getEffectInvoker(): EffectInvoker {
    return this.effectInvoker;
  }

  getReleaseGuard(): ReleaseGuard {
    return this.releaseGuard;
  }

  private async dispatch(req: SdkRequest): Promise<unknown> {
    const ctx = await this.resolveContext(req);

    switch (req.capability) {
      case "identity.current":
        return {
          actorId: ctx.actorId,
          tenantId: ctx.tenantId,
          roles: ctx.roles,
          ...(ctx.groups ? { groups: ctx.groups } : {}),
          ...(ctx.impersonating ? { impersonating: ctx.impersonating } : {}),
        } satisfies IdentityContext;
      case "permissions.can":
        return this.checkPermission(ctx, req);
      case "entity.query":
        return this.entityGateway.query(ctx, requiredTarget(req), req.input);
      case "entity.get":
        return this.entityGateway.get(
          ctx,
          requiredTarget(req),
          requiredId(req.input),
        );
      case "process.run":
        return this.processEngine.run(ctx, requiredTarget(req), req.input);
      case "event.subscribe":
        return this.subscribeToEvent(ctx, req);
      case "audit.annotate":
        return this.annotateAudit(ctx, req);
      case "effect.invoke":
        return this.invokeEffect(ctx, req);
      default:
        return exhaustiveCapability(req.capability);
    }
  }

  private async resolveContext(req: SdkRequest): Promise<RuntimeContext> {
    const identity = await this.identityResolver.resolve(req.actorId, req.tenantId);
    return {
      actorId: identity.actorId,
      tenantId: identity.tenantId,
      roles: identity.roles,
      ...(identity.groups ? { groups: identity.groups } : {}),
      ...(identity.impersonating ? { impersonating: identity.impersonating } : {}),
      domainId: this.opts.compiled.manifest.metadata.id,
      surfaceId: req.surfaceId,
      env: this.env,
    };
  }

  private checkPermission(ctx: RuntimeContext, req: SdkRequest): unknown {
    const target = requiredTarget(req);
    const request = permissionRequestFromInput(target, req.input);
    return this.permissionEngine.can(ctx.roles, request.capability, request.target);
  }

  private subscribeToEvent(
    ctx: RuntimeContext,
    req: SdkRequest,
  ): { unsubscribe(): void } {
    const eventId = requiredTarget(req);
    const decision = this.permissionEngine.can(
      ctx.roles,
      "event.subscribe",
      eventId,
    );
    if (!decision.allowed) {
      throw sdkError(
        "permission_denied",
        `Actor is not allowed to subscribe to ${eventId}.`,
        { eventId, reason: decision.reason },
      );
    }
    const callback = isRecord(req.input) ? req.input.callback : undefined;
    if (typeof callback !== "function") {
      return { unsubscribe() {} };
    }
    const unsubscribe = this.eventBus.subscribe(eventId, (event) => {
      callback(event.payload);
    });
    return { unsubscribe };
  }

  private async annotateAudit(
    ctx: RuntimeContext,
    req: SdkRequest,
  ): Promise<{ annotated: true }> {
    const input = isRecord(req.input) ? req.input : {};
    const target =
      typeof input.target === "string" ? input.target : requiredTarget(req);
    const reason = typeof input.reason === "string" ? input.reason : undefined;
    await this.auditEngine.append({
      id: this.opts.ids.next("audit"),
      ts: this.opts.clock.now(),
      actorId: ctx.actorId,
      tenantId: ctx.tenantId,
      domainId: ctx.domainId,
      ...(ctx.surfaceId ? { surfaceId: ctx.surfaceId } : {}),
      capability: "audit.annotate",
      target,
      result: "ok",
      ...(reason ? { reason } : {}),
      redactedInput: req.input,
    });
    return { annotated: true };
  }

  private async invokeEffect(ctx: RuntimeContext, req: SdkRequest): Promise<unknown> {
    const effectId = requiredTarget(req);
    const processRunId = req.idempotencyKey ?? this.opts.ids.next("run");
    let redactPaths: string[] = [];
    try {
      redactPaths = this.effectInvoker.preflight(ctx, effectId, processRunId)
        .redactPaths;
      const output = await this.effectInvoker.invoke(ctx, {
        effectId,
        input: req.input,
        processRunId,
      });
      await this.auditEngine.append(
        {
          id: this.opts.ids.next("audit"),
          ts: this.opts.clock.now(),
          actorId: ctx.actorId,
          tenantId: ctx.tenantId,
          domainId: ctx.domainId,
          ...(ctx.surfaceId ? { surfaceId: ctx.surfaceId } : {}),
          capability: "effect.invoke",
          target: effectId,
          result: "ok",
          redactedInput: this.auditEngine.redact(
            { input: req.input },
            redactPaths,
          ),
        },
        this.opts.compiled.manifest.effects[effectId]?.audit?.level ?? "always",
      );
      return output;
    } catch (error) {
      await this.auditEngine.append({
        id: this.opts.ids.next("audit"),
        ts: this.opts.clock.now(),
        actorId: ctx.actorId,
        tenantId: ctx.tenantId,
        domainId: ctx.domainId,
        ...(ctx.surfaceId ? { surfaceId: ctx.surfaceId } : {}),
        capability: "effect.invoke",
        target: effectId,
        result: "denied",
        reason: error instanceof Error ? error.message : "Effect denied",
        redactedInput: this.auditEngine.redact({ input: req.input }, redactPaths),
      });
      throw error;
    }
  }
}

export function createDefaultIdentityResolver(
  compiled: CompiledManifest,
  opts: {
    personas?: readonly RuntimePersona[];
    roleMap?: RuntimeRoleMap;
  } = {},
): IdentityContextResolver {
  const manifestPersonas = (compiled.manifest.identity.personas ?? []).map(
    personaFromManifest,
  );
  const personas = [...manifestPersonas, ...(opts.personas ?? [])];

  return {
    async resolve(actorId, tenantId) {
      const roleMapEntry = opts.roleMap?.[actorId];
      if (roleMapEntry !== undefined) {
        const mapped = identityFromRoleMap(actorId, tenantId, roleMapEntry);
        if (mapped) {
          return mapped;
        }
      }

      const persona = personas.find((candidate) => candidate.id === actorId);
      if (persona) {
        return {
          actorId,
          tenantId: persona.tenantId ?? tenantId,
          roles: persona.roles ? [...persona.roles] : rolesFromPersona(persona),
        };
      }

      return { actorId, tenantId, roles: [] };
    },
  };
}

function personaFromManifest(persona: ManifestPersona): RuntimePersona {
  return {
    id: persona.id,
    role: persona.role,
    ...(persona.tenantId ? { tenantId: persona.tenantId } : {}),
  };
}

function identityFromRoleMap(
  actorId: string,
  tenantId: string,
  entry: RuntimeRoleMap[string],
): IdentityContext | undefined {
  if (typeof entry === "string") {
    return { actorId, tenantId, roles: [entry] };
  }
  if (isReadonlyStringArray(entry)) {
    return { actorId, tenantId, roles: [...entry] };
  }
  const roles = entry.roles ? [...entry.roles] : entry.role ? [entry.role] : [];
  return {
    actorId,
    tenantId: entry.tenantId ?? tenantId,
    roles,
  };
}

function rolesFromPersona(persona: RuntimePersona): string[] {
  if (persona.roles) {
    return [...persona.roles];
  }
  return persona.role ? [persona.role] : [];
}

function permissionRequestFromInput(
  defaultTarget: string,
  input: unknown,
): { capability: string; target: string } {
  if (isRecord(input)) {
    if (typeof input.capability === "string" && typeof input.target === "string") {
      return { capability: input.capability, target: input.target };
    }
    if (typeof input.process === "string") {
      return { capability: "process.run", target: input.process };
    }
    if (typeof input.query === "string") {
      return { capability: "entity.query", target: input.query };
    }
    if (typeof input.effect === "string") {
      return { capability: "effect.invoke", target: input.effect };
    }
    if (typeof input.entity === "string") {
      return { capability: "entity.get", target: input.entity };
    }
  }
  return { capability: "permission", target: defaultTarget };
}

function requiredTarget(req: SdkRequest): string {
  if (!req.target) {
    throw sdkError(
      "validation",
      `Capability "${req.capability}" requires a target.`,
      { capability: req.capability },
    );
  }
  return req.target;
}

function requiredId(input: unknown): string {
  if (isRecord(input) && typeof input.id === "string" && input.id.length > 0) {
    return input.id;
  }
  throw sdkError("validation", "Entity get requires input.id.");
}

function exhaustiveCapability(value: never): never {
  throw sdkError("validation", `Unsupported capability "${String(value)}".`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}
