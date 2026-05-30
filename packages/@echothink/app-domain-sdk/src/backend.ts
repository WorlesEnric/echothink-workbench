import type { DomainDescriptor } from "./descriptor.js";
import type { IdentityContext } from "./identity.js";
import type { Transport } from "./transport.js";
import {
  type AppDomainClient,
  createAppDomainClient,
} from "./client.js";

export interface BackendDomainClientOptions {
  transport: Transport;
  descriptor: { id: string; manifestVersion: string };
  identity: IdentityContext;
}

export function createBackendDomainClient<D extends DomainDescriptor>(
  opts: BackendDomainClientOptions,
): AppDomainClient<D> {
  return createAppDomainClient<D>({
    transport: opts.transport,
    descriptor: opts.descriptor,
    surfaceId: "__backend__",
    identity: opts.identity,
  });
}
