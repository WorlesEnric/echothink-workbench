import type { Sha256, SdkCapability } from "@echothink/shared-types";

import type {
  DomainDescriptor,
  EffectInput,
  EffectKey,
  EffectOutput,
  EntityKey,
  EntityShape,
  EventKey,
  EventPayload,
  PermKey,
  ProcessInput,
  ProcessKey,
  ProcessResult,
  QueryArgs,
  QueryKey,
  QueryRow,
} from "./descriptor.js";
import type { IdentityContext, PermCheckCtx } from "./identity.js";
import {
  type EventSubscriptionHandle,
  type SdkRequest,
  SdkCallError,
  type Transport,
} from "./transport.js";

export interface AppDomainClient<D extends DomainDescriptor> {
  identity: {
    current(): IdentityContext;
    currentAsync(): Promise<IdentityContext>;
  };
  permissions: {
    can(permission: PermKey<D>, ctx?: PermCheckCtx): boolean;
    canAsync(permission: PermKey<D>, ctx?: PermCheckCtx): Promise<boolean>;
  };
  refreshPermissions(
    permissions?: readonly PermKey<D>[],
    ctx?: PermCheckCtx,
  ): Promise<Partial<Record<PermKey<D>, boolean>>>;
  entities: {
    query<Q extends QueryKey<D>>(
      q: Q,
      args?: QueryArgs<D, Q>,
    ): Promise<QueryRow<D, Q>[]>;
    get<E extends EntityKey<D>>(
      entity: E,
      id: string,
    ): Promise<EntityShape<D, E> | null>;
  };
  processes: {
    run<P extends ProcessKey<D>>(
      p: P,
      input: ProcessInput<D, P> & { reason?: string },
    ): Promise<ProcessResult<D, P>>;
    canRun<P extends ProcessKey<D>>(p: P): boolean;
    canRunAsync<P extends ProcessKey<D>>(p: P): Promise<boolean>;
  };
  events: {
    subscribe<E extends EventKey<D>>(
      e: E,
      cb: (payload: EventPayload<D, E>) => void,
    ): () => void;
  };
  audit: {
    annotate(input: { target: string; reason: string }): Promise<void>;
  };
  effects: {
    invoke<F extends EffectKey<D>>(
      f: F,
      input: EffectInput<D, F>,
    ): Promise<EffectOutput<D, F>>;
  };
}

export interface AppDomainClientOptions {
  transport: Transport;
  descriptor: { id: string; manifestVersion: string };
  surfaceId: string;
  surfaceDigest?: Sha256;
  identity: IdentityContext;
  idempotency?: () => string;
}

type UnsubscribeFn = () => void | Promise<void>;

export function createAppDomainClient<D extends DomainDescriptor>(
  opts: AppDomainClientOptions,
): AppDomainClient<D> {
  const permissionCache = new Map<string, boolean>();
  const pendingPermissions = new Map<string, Promise<boolean>>();
  let identityCache = opts.identity;
  let identityPending: Promise<IdentityContext> | undefined;

  const buildRequest = (
    capability: SdkCapability,
    target?: string,
    input?: unknown,
    idempotent = false,
  ): SdkRequest => {
    const req: SdkRequest = {
      domainId: opts.descriptor.id,
      manifestVersion: opts.descriptor.manifestVersion,
      surfaceId: opts.surfaceId,
      actorId: identityCache.actorId,
      tenantId: identityCache.tenantId,
      capability,
    };

    if (opts.surfaceDigest !== undefined) {
      req.surfaceDigest = opts.surfaceDigest;
    }
    if (target !== undefined) {
      req.target = target;
    }
    if (input !== undefined) {
      req.input = input;
    }
    if (idempotent && opts.idempotency !== undefined) {
      req.idempotencyKey = opts.idempotency();
    }

    return req;
  };

  const callData = async (req: SdkRequest): Promise<unknown> => {
    const response = await opts.transport.call(req);
    if (!response.ok) {
      throw new SdkCallError(response.error);
    }
    return response.data;
  };

  const currentAsync = (): Promise<IdentityContext> => {
    if (identityPending !== undefined) {
      return identityPending;
    }

    identityPending = callData(buildRequest("identity.current"))
      .then((data) => {
        if (isIdentityContext(data)) {
          identityCache = data;
        }
        return identityCache;
      })
      .finally(() => {
        identityPending = undefined;
      });

    return identityPending;
  };

  const requestPermission = (
    target: string,
    ctx?: PermCheckCtx,
  ): Promise<boolean> => {
    const cacheKey = permissionCacheKey(target, ctx);
    const pending = pendingPermissions.get(cacheKey);
    if (pending !== undefined) {
      return pending;
    }

    const request = callData(buildRequest("permissions.can", target, ctx))
      .then((data) => {
        const allowed = booleanFromPermissionData(data);
        permissionCache.set(cacheKey, allowed);
        return allowed;
      })
      .finally(() => {
        pendingPermissions.delete(cacheKey);
      });

    pendingPermissions.set(cacheKey, request);
    return request;
  };

  const getCachedPermission = (target: string, ctx?: PermCheckCtx): boolean =>
    permissionCache.get(permissionCacheKey(target, ctx)) ?? false;

  const client: AppDomainClient<D> = {
    identity: {
      current() {
        void currentAsync().catch(() => undefined);
        return identityCache;
      },
      currentAsync,
    },
    permissions: {
      can(permission, ctx) {
        void requestPermission(String(permission), ctx).catch(() => undefined);
        return getCachedPermission(String(permission), ctx);
      },
      canAsync(permission, ctx) {
        return requestPermission(String(permission), ctx);
      },
    },
    async refreshPermissions(permissions, ctx) {
      const targets =
        permissions?.map((permission) => String(permission)) ??
        uniquePermissionTargets(permissionCache.keys());

      const pairs = await Promise.all(
        targets.map(async (target) => {
          const allowed = await requestPermission(target, ctx);
          return [target, allowed] as const;
        }),
      );

      return Object.fromEntries(pairs) as Partial<Record<PermKey<D>, boolean>>;
    },
    entities: {
      async query(q, args) {
        const data = await callData(
          buildRequest("entity.query", String(q), args),
        );
        return data as QueryRow<D, typeof q>[];
      },
      async get(entity, id) {
        const data = await callData(
          buildRequest("entity.get", String(entity), { id }),
        );
        return data as EntityShape<D, typeof entity> | null;
      },
    },
    processes: {
      async run(p, input) {
        const data = await callData(
          buildRequest("process.run", String(p), input, true),
        );
        return data as ProcessResult<D, typeof p>;
      },
      canRun(p) {
        const process = String(p);
        return (
          getCachedPermission(process, processPermissionCtx(process)) ||
          getCachedPermission(process)
        );
      },
      async canRunAsync(p) {
        const process = String(p);
        const allowed = await requestPermission(
          process,
          processPermissionCtx(process),
        );
        permissionCache.set(permissionCacheKey(process), allowed);
        return allowed;
      },
    },
    events: {
      subscribe(e, cb) {
        let unsubscribe: UnsubscribeFn | undefined;
        let disposed = false;

        void callData(
          buildRequest("event.subscribe", String(e), { callback: cb }),
        )
          .then((data) => {
            unsubscribe = unsubscribeFromHandle(data);
            if (disposed && unsubscribe !== undefined) {
              void unsubscribe();
            }
          })
          .catch(() => undefined);

        return () => {
          disposed = true;
          if (unsubscribe !== undefined) {
            void unsubscribe();
          }
        };
      },
    },
    audit: {
      async annotate(input) {
        await callData(
          buildRequest("audit.annotate", input.target, input, true),
        );
      },
    },
    effects: {
      async invoke(f, input) {
        const data = await callData(
          buildRequest("effect.invoke", String(f), input, true),
        );
        return data as EffectOutput<D, typeof f>;
      },
    },
  };

  return client;
}

function processPermissionCtx(process: string): PermCheckCtx {
  return { process };
}

function permissionCacheKey(target: string, ctx?: PermCheckCtx): string {
  if (ctx === undefined) {
    return target;
  }

  try {
    return `${target}\u0000${JSON.stringify(ctx)}`;
  } catch {
    return `${target}\u0000[ctx]`;
  }
}

function uniquePermissionTargets(keys: IterableIterator<string>): string[] {
  const targets = new Set<string>();
  for (const key of keys) {
    targets.add(key.split("\u0000", 1)[0] ?? key);
  }
  return [...targets];
}

function booleanFromPermissionData(data: unknown): boolean {
  if (typeof data === "boolean") {
    return data;
  }
  if (isRecord(data) && typeof data.allowed === "boolean") {
    return data.allowed;
  }
  return Boolean(data);
}

function unsubscribeFromHandle(data: unknown): UnsubscribeFn | undefined {
  if (typeof data === "function") {
    return data as UnsubscribeFn;
  }
  if (!isRecord(data)) {
    return undefined;
  }

  const maybeHandle = data as Partial<EventSubscriptionHandle>;
  if (typeof maybeHandle.unsubscribe !== "function") {
    return undefined;
  }

  return () => maybeHandle.unsubscribe?.();
}

function isIdentityContext(value: unknown): value is IdentityContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.actorId === "string" &&
    typeof value.tenantId === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
