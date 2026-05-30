import { join, resolve } from "node:path";
import type { SurfaceRegistration } from "@echothink/domain-manifest";
import ts from "typescript";
import type { Gate } from "../types.js";
import {
  composedOrCustomSurfaceFiles,
  errorFinding,
  gateResult,
  generatedKernelFiles,
  isSurfaceSourceFile,
  normalizePath,
  relativeFile,
} from "./common.js";

const SURFACE_AMBIENT_FILE = ".echothink-validation-surface-ambient.d.ts";
const SURFACE_BASE_MODULES = [
  "@tanstack/react-query",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;
const TYPED_MODULES = new Set([
  "@echothink/app-domain-sdk",
  "@echothink/app-domain-sdk/react",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

export const typescriptGate: Gate = {
  id: "typescript",
  async run(ctx) {
    const kernelFiles = generatedKernelFiles(ctx.domainDir);
    const surfaceFiles = composedOrCustomSurfaceFiles(ctx.domainDir).filter(
      isSurfaceSourceFile,
    );

    if (kernelFiles.length === 0 && surfaceFiles.length === 0) {
      return gateResult(this.id, [
        errorFinding(
          "TS_NO_INPUTS",
          "No generated kernel or surface TypeScript files were found.",
          { file: join(ctx.domainDir, "kernel") },
        ),
      ]);
    }

    const diagnostics = [
      ...(kernelFiles.length > 0
        ? ts.getPreEmitDiagnostics(createKernelProgram(kernelFiles))
        : []),
      ...(surfaceFiles.length > 0
        ? ts.getPreEmitDiagnostics(
            createSurfaceProgram(ctx.domainDir, surfaceFiles, ctx.surfaces),
          )
        : []),
    ];

    return gateResult(
      this.id,
      diagnostics.map((diagnostic) => {
        const file = diagnostic.file;
        const position =
          file && diagnostic.start !== undefined
            ? file.getLineAndCharacterOfPosition(diagnostic.start)
            : undefined;
        return errorFinding(
          `TS${diagnostic.code}`,
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          {
            ...(file ? { file: relativeFile(ctx.domainDir, file.fileName) } : {}),
            ...(position ? { line: position.line + 1 } : {}),
          },
        );
      }),
    );
  },
};

function createKernelProgram(rootNames: string[]): ts.Program {
  return ts.createProgram(rootNames, {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ["lib.es2022.d.ts"],
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    types: [],
  });
}

function createSurfaceProgram(
  domainDir: string,
  rootNames: string[],
  surfaces: readonly SurfaceRegistration[],
): ts.Program {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    types: [],
  };
  const ambientFileName = join(domainDir, SURFACE_AMBIENT_FILE);
  return ts.createProgram(
    [...rootNames, ambientFileName],
    options,
    createAmbientCompilerHost(
      options,
      ambientFileName,
      renderSurfaceAmbientDeclarations(surfaces),
    ),
  );
}

function createAmbientCompilerHost(
  options: ts.CompilerOptions,
  ambientFileName: string,
  ambientText: string,
): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true);
  const normalizedAmbient = normalizePath(resolve(ambientFileName));
  const isAmbientFile = (fileName: string): boolean =>
    normalizePath(resolve(fileName)) === normalizedAmbient;
  const ambientSourceFile = ts.createSourceFile(
    ambientFileName,
    ambientText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const defaultFileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) =>
    isAmbientFile(fileName) || defaultFileExists(fileName);

  const defaultReadFile = host.readFile.bind(host);
  host.readFile = (fileName) =>
    isAmbientFile(fileName) ? ambientText : defaultReadFile(fileName);

  const defaultGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    isAmbientFile(fileName)
      ? ambientSourceFile
      : defaultGetSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  return host;
}

function renderSurfaceAmbientDeclarations(
  surfaces: readonly SurfaceRegistration[],
): string {
  const modules = new Set<string>(SURFACE_BASE_MODULES);
  for (const surface of surfaces) {
    if (surface.type === "standard") {
      continue;
    }
    for (const allowedImport of surface.allowedImports ?? []) {
      modules.add(allowedImport);
    }
  }

  return `${[
    REACT_AMBIENT_DECLARATIONS,
    SDK_AMBIENT_DECLARATIONS,
    ...[...modules]
      .filter((moduleName) => !TYPED_MODULES.has(moduleName))
      .sort()
      .map((moduleName) => `declare module ${JSON.stringify(moduleName)};`),
  ].join("\n\n")}\n`;
}

const REACT_AMBIENT_DECLARATIONS = `
declare namespace JSX {
  interface Element {}
  interface ElementClass { render?: unknown; }
  interface IntrinsicAttributes { key?: unknown; }
  interface IntrinsicElements { [elementName: string]: any; }
}

declare module "react" {
  export type ReactElement = any;
  export type ReactNode = any;
  export type SetStateAction<S> = S | ((previous: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export function createContext<T>(defaultValue: T): any;
  export function useContext<T>(context: any): T;
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  const React: any;
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export function jsx(...args: any[]): any;
  export function jsxs(...args: any[]): any;
}

declare module "react/jsx-dev-runtime" {
  export const Fragment: any;
  export function jsxDEV(...args: any[]): any;
}
`.trim();

const SDK_AMBIENT_DECLARATIONS = `
declare module "@echothink/app-domain-sdk" {
  export interface IdentityContext {
    actorId: string;
    tenantId: string;
    role?: string;
    [key: string]: unknown;
  }
  export interface PermCheckCtx { [key: string]: unknown; }
  export interface SdkRequest {
    domainId: string;
    manifestVersion: string;
    surfaceId: string;
    actorId: string;
    tenantId: string;
    capability: string;
    target?: string;
    input?: unknown;
    idempotencyKey?: string;
    surfaceDigest?: string;
  }
  export interface DomainDescriptor {
    id: string;
    entities: object;
    queries: object;
    processes: object;
    events: object;
    effects: object;
    permissions: string;
  }

  type StringKey<T> = Extract<keyof T, string>;
  export type EntityKey<D extends DomainDescriptor> = StringKey<D["entities"]>;
  export type EntityShape<D extends DomainDescriptor, E extends EntityKey<D>> = D["entities"][E];
  export type QueryKey<D extends DomainDescriptor> = StringKey<D["queries"]>;
  export type QueryArgs<D extends DomainDescriptor, Q extends QueryKey<D>> =
    D["queries"][Q] extends { args: infer Args } ? Args : undefined;
  export type QueryRow<D extends DomainDescriptor, Q extends QueryKey<D>> =
    D["queries"][Q] extends { row: infer Row } ? Row : unknown;
  export type ProcessKey<D extends DomainDescriptor> = StringKey<D["processes"]>;
  export type ProcessResult<D extends DomainDescriptor, P extends ProcessKey<D>> =
    D["processes"][P] extends { output: infer Output } ? Output : void;
  export type EventKey<D extends DomainDescriptor> = StringKey<D["events"]>;
  export type EventPayload<D extends DomainDescriptor, E extends EventKey<D>> = D["events"][E];

  export interface AppDomainClient<D extends DomainDescriptor> {
    identity: {
      current(): IdentityContext;
      currentAsync(): Promise<IdentityContext>;
    };
    permissions: {
      can(permission: string, ctx?: PermCheckCtx): boolean;
      canAsync(permission: string, ctx?: PermCheckCtx): Promise<boolean>;
    };
    refreshPermissions(
      permissions?: readonly string[],
      ctx?: PermCheckCtx,
    ): Promise<Partial<Record<D["permissions"] & string, boolean>>>;
    entities: {
      query<Q extends QueryKey<D>>(
        q: Q,
        args?: QueryArgs<D, Q> | Record<string, unknown>,
      ): Promise<QueryRow<D, Q>[]>;
      get<E extends EntityKey<D>>(
        entity: E,
        id: string,
      ): Promise<EntityShape<D, E> | null>;
    };
    processes: {
      run<P extends ProcessKey<D>>(
        p: P,
        input: Record<string, unknown> & { reason?: string },
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
    audit: { annotate(input: { target: string; reason: string }): Promise<void>; };
    effects: { invoke(effect: string, input: Record<string, unknown>): Promise<unknown>; };
  }
}

declare module "@echothink/app-domain-sdk/react" {
  import type {
    AppDomainClient,
    DomainDescriptor,
    EventKey,
    EventPayload,
    ProcessKey,
    ProcessResult,
    QueryArgs,
    QueryKey,
    QueryRow,
  } from "@echothink/app-domain-sdk";

  export interface AppDomainProviderProps<D extends DomainDescriptor = DomainDescriptor> {
    client: AppDomainClient<D>;
    children: unknown;
  }
  export function AppDomainProvider<D extends DomainDescriptor>(
    props: AppDomainProviderProps<D>,
  ): any;
  export function useAppDomain<D extends DomainDescriptor>(): AppDomainClient<D>;
  export interface UseProcessResult<D extends DomainDescriptor, P extends ProcessKey<D>> {
    run(input: Record<string, unknown> & { reason?: string }): Promise<ProcessResult<D, P>>;
    canRun: boolean;
    isRunning: boolean;
    error?: Error;
  }
  export function useProcess<D extends DomainDescriptor, P extends ProcessKey<D>>(
    p: P,
  ): UseProcessResult<D, P>;
  export interface UseEntityQueryResult<D extends DomainDescriptor, Q extends QueryKey<D>> {
    data: QueryRow<D, Q>[] | undefined;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  }
  export function useEntityQuery<D extends DomainDescriptor, Q extends QueryKey<D>>(
    q: Q,
    args?: QueryArgs<D, Q> | Record<string, unknown>,
  ): UseEntityQueryResult<D, Q>;
  export function usePermission<D extends DomainDescriptor>(p: string): boolean;
  export function useDomainEvent<D extends DomainDescriptor, E extends EventKey<D>>(
    e: E,
    cb: (payload: EventPayload<D, E>) => void,
  ): void;
}
`.trim();
