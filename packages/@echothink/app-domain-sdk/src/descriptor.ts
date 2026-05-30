export interface DomainDescriptor {
  id: string;
  entities: Record<string, Record<string, unknown>>;
  queries: Record<string, { args?: Record<string, unknown>; row: unknown }>;
  processes: Record<
    string,
    { input: Record<string, unknown>; output?: unknown }
  >;
  events: Record<string, Record<string, unknown>>;
  effects: Record<string, { input: Record<string, unknown>; output?: unknown }>;
  permissions: string;
}

type StringKey<T> = Extract<keyof T, string>;

export type EntityKey<D extends DomainDescriptor> = StringKey<D["entities"]>;

export type EntityShape<
  D extends DomainDescriptor,
  E extends EntityKey<D>,
> = D["entities"][E];

export type QueryKey<D extends DomainDescriptor> = StringKey<D["queries"]>;

export type QueryArgs<
  D extends DomainDescriptor,
  Q extends QueryKey<D>,
> = D["queries"][Q] extends { args: infer Args } ? Args : undefined;

export type QueryRow<
  D extends DomainDescriptor,
  Q extends QueryKey<D>,
> = D["queries"][Q]["row"];

export type ProcessKey<D extends DomainDescriptor> = StringKey<D["processes"]>;

export type ProcessInput<
  D extends DomainDescriptor,
  P extends ProcessKey<D>,
> = D["processes"][P]["input"];

export type ProcessResult<
  D extends DomainDescriptor,
  P extends ProcessKey<D>,
> = D["processes"][P] extends { output: infer Output } ? Output : void;

export type EventKey<D extends DomainDescriptor> = StringKey<D["events"]>;

export type EventPayload<
  D extends DomainDescriptor,
  E extends EventKey<D>,
> = D["events"][E];

export type EffectKey<D extends DomainDescriptor> = StringKey<D["effects"]>;

export type EffectInput<
  D extends DomainDescriptor,
  F extends EffectKey<D>,
> = D["effects"][F]["input"];

export type EffectOutput<
  D extends DomainDescriptor,
  F extends EffectKey<D>,
> = D["effects"][F] extends { output: infer Output } ? Output : void;

export type PermKey<D extends DomainDescriptor> = D["permissions"] & string;
