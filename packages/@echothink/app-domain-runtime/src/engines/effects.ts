import type { EffectContext, EffectImpl } from "@echothink/app-domain-sdk";
import type { CompiledManifest } from "@echothink/domain-manifest";

import type { RuntimeContext, SecretResolver } from "../adapters.js";
import { sdkError } from "../errors.js";
import type { PermissionEngine } from "./permissions.js";

export interface EffectInvocationInput {
  effectId: string;
  input: unknown;
  processRunId: string;
}

export interface EffectPreflightResult {
  effectId: string;
  redactPaths: string[];
}

export interface EffectInvoker {
  preflight(
    ctx: RuntimeContext,
    effectId: string,
    processRunId: string,
  ): EffectPreflightResult;
  invoke(ctx: RuntimeContext, request: EffectInvocationInput): Promise<unknown>;
}

type RuntimeEffectContext = EffectContext & {
  egress: { allowHosts: string[] };
  secretRef?: string;
};

export class DefaultEffectInvoker implements EffectInvoker {
  private readonly effects = new Map<string, EffectImpl<unknown, unknown>>();

  constructor(
    private readonly compiled: CompiledManifest,
    effectImpls: readonly EffectImpl<unknown, unknown>[],
    private readonly permissionEngine: PermissionEngine,
    private readonly secretResolver: SecretResolver,
  ) {
    for (const effect of effectImpls) {
      this.effects.set(effect.id, effect);
    }
  }

  preflight(
    ctx: RuntimeContext,
    effectId: string,
    processRunId: string,
  ): EffectPreflightResult {
    void processRunId;
    const effect = this.compiled.manifest.effects[effectId];
    if (!effect) {
      throw sdkError("effect_denied", `Effect "${effectId}" is not declared.`, {
        effectId,
      });
    }

    if (!this.effects.has(effectId)) {
      throw sdkError(
        "effect_denied",
        `Effect "${effectId}" has no registered implementation.`,
        { effectId },
      );
    }

    if (!effect.egress) {
      throw sdkError(
        "effect_denied",
        `Effect "${effectId}" does not declare egress allowHosts.`,
        { effectId },
      );
    }

    const environments = effect.environments ?? [];
    if (environments.length > 0 && !environments.includes(ctx.env)) {
      throw sdkError(
        "effect_denied",
        `Effect "${effectId}" is not enabled in ${ctx.env}.`,
        { effectId, env: ctx.env, environments },
      );
    }

    if (effect.requiredPermission) {
      const decision = this.permissionEngine.can(
        ctx.roles,
        "permission",
        effect.requiredPermission,
      );
      if (!decision.allowed) {
        throw sdkError(
          "effect_denied",
          `Effect "${effectId}" requires permission ${effect.requiredPermission}.`,
          {
            effectId,
            permission: effect.requiredPermission,
            reason: decision.reason,
          },
        );
      }
    }

    return {
      effectId,
      redactPaths: [...(effect.audit?.redact ?? [])],
    };
  }

  async invoke(
    ctx: RuntimeContext,
    request: EffectInvocationInput,
  ): Promise<unknown> {
    const effect = this.compiled.manifest.effects[request.effectId];
    this.preflight(ctx, request.effectId, request.processRunId);
    const implementation = this.effects.get(request.effectId);
    if (!implementation || !effect?.egress) {
      throw sdkError(
        "effect_denied",
        `Effect "${request.effectId}" cannot be invoked.`,
        { effectId: request.effectId },
      );
    }

    const effectContext: RuntimeEffectContext = {
      actorId: ctx.actorId,
      tenantId: ctx.tenantId,
      processRunId: request.processRunId,
      secretResolver: this.secretResolver,
      env: ctx.env,
      egress: { allowHosts: [...effect.egress.allowHosts] },
      ...(effect.secretRef ? { secretRef: effect.secretRef } : {}),
    };

    try {
      return await implementation.invoke(request.input, effectContext);
    } catch (error) {
      throw sdkError("effect_denied", `Effect "${request.effectId}" failed.`, {
        effectId: request.effectId,
        cause: error instanceof Error ? error.message : error,
      });
    }
  }
}
