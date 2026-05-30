import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from "react";

import type {
  AppDomainClient,
  DomainDescriptor,
  EventKey,
  EventPayload,
  PermKey,
  ProcessInput,
  ProcessKey,
  ProcessResult,
  QueryArgs,
  QueryKey,
  QueryRow,
} from "../index.js";

const AppDomainContext =
  createContext<AppDomainClient<DomainDescriptor> | null>(null);

export interface AppDomainProviderProps<
  D extends DomainDescriptor = DomainDescriptor,
> {
  client: AppDomainClient<D>;
  children: ReactNode;
}

export function AppDomainProvider<D extends DomainDescriptor>({
  client,
  children,
}: AppDomainProviderProps<D>): ReactElement {
  return (
    <AppDomainContext.Provider
      value={client as unknown as AppDomainClient<DomainDescriptor>}
    >
      {children}
    </AppDomainContext.Provider>
  );
}

export function useAppDomain<D extends DomainDescriptor>(): AppDomainClient<D> {
  const client = useContext(AppDomainContext);
  if (client === null) {
    throw new Error("AppDomainProvider is missing");
  }
  return client as unknown as AppDomainClient<D>;
}

export interface UseProcessResult<
  D extends DomainDescriptor,
  P extends ProcessKey<D>,
> {
  run(input: ProcessInput<D, P> & { reason?: string }): Promise<ProcessResult<D, P>>;
  canRun: boolean;
  isRunning: boolean;
  error?: Error;
}

export function useProcess<
  D extends DomainDescriptor,
  P extends ProcessKey<D>,
>(p: P): UseProcessResult<D, P> {
  const client = useAppDomain<D>();
  const canRunQuery = useQuery<boolean, Error>({
    queryKey: ["app-domain-sdk", "process.canRun", p],
    queryFn: () => client.processes.canRunAsync(p),
    initialData: client.processes.canRun(p),
  });
  const mutation = useMutation<
    ProcessResult<D, P>,
    Error,
    ProcessInput<D, P> & { reason?: string }
  >({
    mutationFn: (input) => client.processes.run(p, input),
  });

  return {
    run: mutation.mutateAsync,
    canRun: canRunQuery.data ?? false,
    isRunning: mutation.isPending,
    error: mutation.error ?? canRunQuery.error ?? undefined,
  };
}

export interface UseEntityQueryResult<
  D extends DomainDescriptor,
  Q extends QueryKey<D>,
> {
  data: QueryRow<D, Q>[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useEntityQuery<
  D extends DomainDescriptor,
  Q extends QueryKey<D>,
>(q: Q, args?: QueryArgs<D, Q>): UseEntityQueryResult<D, Q> {
  const client = useAppDomain<D>();
  const query = useQuery<QueryRow<D, Q>[], Error>({
    queryKey: ["app-domain-sdk", "entity.query", q, args],
    queryFn: () => client.entities.query(q, args),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePermission<D extends DomainDescriptor>(
  p: PermKey<D>,
): boolean {
  const client = useAppDomain<D>();
  const query = useQuery<boolean, Error>({
    queryKey: ["app-domain-sdk", "permissions.can", p],
    queryFn: () => client.permissions.canAsync(p),
    initialData: client.permissions.can(p),
  });

  return query.data ?? false;
}

export function useDomainEvent<
  D extends DomainDescriptor,
  E extends EventKey<D>,
>(e: E, cb: (payload: EventPayload<D, E>) => void): void {
  const client = useAppDomain<D>();
  useEffect(() => client.events.subscribe(e, cb), [client, e, cb]);
}
