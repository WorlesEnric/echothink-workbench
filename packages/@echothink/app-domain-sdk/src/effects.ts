import type { Environment } from "@echothink/shared-types";

export interface EffectContext {
  actorId: string;
  tenantId: string;
  processRunId: string;
  secretResolver: { get(ref: string): Promise<string> };
  env: Environment;
}

export interface EffectImpl<I, O> {
  id: string;
  invoke(input: I, ctx: EffectContext): Promise<O>;
}

export interface EffectStub<I, O> {
  id: string;
  stub(input: I): Promise<O>;
}

export function defineEffect<I, O>(spec: EffectImpl<I, O>): EffectImpl<I, O> {
  return spec;
}

export function defineEffectStub<I, O>(
  spec: EffectStub<I, O>,
): EffectStub<I, O> {
  return spec;
}
