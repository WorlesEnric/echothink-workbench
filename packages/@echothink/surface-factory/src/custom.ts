import type { CompiledManifest, SurfaceRegistration } from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import { arrayLiteral, literal, pascalCase, titleCase } from "./utils.js";

export function scaffoldCustomSurface(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): GeneratedFile[] {
  const basePath = `surfaces/custom/${surface.id}`;
  return [
    {
      path: `${basePath}/index.tsx`,
      contents: renderCustomIndex(compiled, surface),
    },
    {
      path: `${basePath}/bridge.ts`,
      contents: renderBridge(compiled, surface),
    },
    {
      path: `${basePath}/stories.tsx`,
      contents: renderCustomStory(compiled, surface),
    },
    {
      path: `${basePath}/tests.spec.tsx`,
      contents: renderCustomSmokeTest(compiled, surface),
    },
    {
      path: `${basePath}/custom-surface.exception.yaml`,
      contents: renderException(compiled, surface),
    },
  ];
}

function renderCustomIndex(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const componentName = `${pascalCase(surface.id)}CustomSurface`;
  return `import type { AppDomainClient, DomainDescriptor } from "@echothink/app-domain-sdk";
import { useMemo, type ReactElement } from "react";

import { createCustomSurfaceBridge } from "./bridge";

export interface ${componentName}Props {
  client: AppDomainClient<DomainDescriptor>;
}

export function ${componentName}({ client }: ${componentName}Props): ReactElement {
  const bridge = useMemo(() => createCustomSurfaceBridge(client), [client]);
  const identity = bridge.identity();

  return (
    <section data-domain-id=${literal(compiled.manifest.metadata.id)} data-surface-id=${literal(surface.id)}>
      <header>
        <h1>${titleCase(surface.id)}</h1>
        <p>{identity.tenantId}</p>
      </header>
      <div data-custom-surface-container="sdk-bridge-only" />
    </section>
  );
}
`;
}

function renderBridge(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  return `import type { AppDomainClient, DomainDescriptor } from "@echothink/app-domain-sdk";

export function createCustomSurfaceBridge(client: AppDomainClient<DomainDescriptor>) {
  return {
    identity() {
      return client.identity.current();
    },
    query(queryId: string, args?: Record<string, unknown>) {
      return client.entities.query(queryId, args);
    },
    run(processId: string, input: Record<string, unknown> & { reason?: string }) {
      return client.processes.run(processId, input);
    },
    canRun(processId: string) {
      return client.processes.canRun(processId);
    },
    surface: {
      domainId: ${literal(compiled.manifest.metadata.id)},
      id: ${literal(surface.id)},
      isolation: ${literal(surface.isolation ?? "iframe")},
    },
  };
}
`;
}

function renderCustomStory(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const componentName = `${pascalCase(surface.id)}CustomSurface`;
  return `import { createAppDomainClient, type Transport } from "@echothink/app-domain-sdk";

import { ${componentName} } from "./index";

const transport: Transport = {
  async call() {
    return { ok: true, data: undefined };
  },
};

const client = createAppDomainClient({
  transport,
  descriptor: { id: ${literal(compiled.manifest.metadata.id)}, manifestVersion: ${literal(compiled.manifest.metadata.version)} },
  surfaceId: ${literal(surface.id)},
  identity: { actorId: "preview", tenantId: "org_456", roles: ["viewer"] },
});

export const Default = () => <${componentName} client={client} />;

export default {
  title: ${literal(`App Domains/${compiled.manifest.metadata.id}/${surface.id}`)},
};
`;
}

function renderCustomSmokeTest(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const componentName = `${pascalCase(surface.id)}CustomSurface`;
  return `import { describe, expect, it } from "vitest";

import * as surfaceModule from "./index";

describe(${literal(`${compiled.manifest.metadata.id}/${surface.id}`)}, () => {
  it("exports the custom surface component and bridge entrypoint", async () => {
    expect(typeof surfaceModule.${componentName}).toBe("function");
    const bridge = await import("./bridge");
    expect(typeof bridge.createCustomSurfaceBridge).toBe("function");
  });
});
`;
}

function renderException(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): string {
  const lines: string[] = [];
  lines.push("apiVersion: echothink.ai/custom-surface-exception/v1");
  lines.push("kind: CustomSurfaceException");
  lines.push("metadata:");
  lines.push(`  domainId: ${compiled.manifest.metadata.id}`);
  lines.push(`  surfaceId: ${surface.id}`);
  lines.push(`  route: ${surface.route}`);
  lines.push("dependencyException:");
  lines.push(`  allowedImports: ${arrayLiteral(surface.allowedImports ?? [])}`);
  lines.push("  newDependencies: []");
  lines.push("threatModel:");
  lines.push("  summary: SDK bridge only; no direct network, filesystem, database, or secret access.");
  lines.push("  sensitiveData: []");
  lines.push("  mitigations:");
  lines.push("    - Echothink-controlled container owns transport and identity context.");
  lines.push("    - Runtime validates every entity, process, event, and effect capability.");
  lines.push("isolation:");
  lines.push(`  mode: ${surface.isolation ?? "iframe"}`);
  lines.push("  csp: strict");
  lines.push("  directNetwork: false");
  lines.push("  directMutation: false");
  lines.push("approvals:");
  lines.push("  required:");
  lines.push("    - platform-architect");
  lines.push("    - security");
  lines.push("    - domain-owner");
  lines.push("    - release-manager");
  return `${lines.join("\n")}\n`;
}
