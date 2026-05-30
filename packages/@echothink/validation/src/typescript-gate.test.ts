import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileManifest,
  generateKernel,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { typescriptGate } from "./gates/typescript.js";
import type { GateContext } from "./types.js";

const NOW = "2026-05-29T12:00:00.000Z";
const fixtureManifest = readFileSync(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
  "utf8",
);

describe("typescriptGate", () => {
  it("passes a clean browser surface with allowed external UI imports", async () => {
    const { ctx, entry } = createTypeScriptContext();
    writeFileSync(entry, cleanSurfaceSource(), "utf8");

    const result = await typescriptGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails genuine type errors in surface SDK usage", async () => {
    const { ctx, entry } = createTypeScriptContext();
    writeFileSync(entry, surfaceWithSdkTypeError(), "utf8");

    const result = await typescriptGate.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TS2339",
          file: "surfaces/composed/triage-console/index.tsx",
        }),
      ]),
    );
  });
});

function createTypeScriptContext(): { ctx: GateContext; entry: string } {
  const domainDir = mkdtempSync(join(tmpdir(), "echothink-typescript-"));
  const compiled = compileManifest(parseManifestYaml(fixtureManifest).manifest, {
    now: NOW,
  });
  for (const file of generateKernel(compiled)) {
    const path = join(domainDir, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.contents, "utf8");
  }

  const entry = join(domainDir, "surfaces/composed/triage-console/index.tsx");
  mkdirSync(dirname(entry), { recursive: true });
  return {
    entry,
    ctx: {
      domainDir,
      compiled,
      surfaces: compiled.surfaceRegistrations,
      runId: "typescript-test",
      now: NOW,
    },
  };
}

function cleanSurfaceSource(): string {
  return [
    'import type { DomainDescriptor } from "@echothink/app-domain-sdk";',
    'import { useAppDomain, useEntityQuery } from "@echothink/app-domain-sdk/react";',
    'import { Button } from "@echothink-ui/core";',
    'import { DataTable } from "@echothink-ui/data";',
    'import { useMemo, type ReactElement } from "react";',
    "",
    domainTypeSource(),
    "",
    'const QUERY_ID = "issue.openQueue" as const;',
    "",
    "export function TriageConsoleSurface(): ReactElement {",
    "  const domain = useAppDomain<TestDomain>();",
    "  const query = useEntityQuery<TestDomain, typeof QUERY_ID>(QUERY_ID, {});",
    "  const rows = query.data ?? [];",
    "  const titles = useMemo(() => rows.map((row) => row.title), [rows]);",
    "  const identity = domain.identity.current();",
    "  return (",
    "    <div data-tenant={identity.tenantId}>",
    "      <Button>{titles.join(', ')}</Button>",
    "      <DataTable rows={rows} />",
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function surfaceWithSdkTypeError(): string {
  return [
    'import type { DomainDescriptor } from "@echothink/app-domain-sdk";',
    'import { useAppDomain } from "@echothink/app-domain-sdk/react";',
    'import { type ReactElement } from "react";',
    "",
    domainTypeSource(),
    "",
    "export function TriageConsoleSurface(): ReactElement {",
    "  const domain = useAppDomain<TestDomain>();",
    "  domain.notARealSdkMethod();",
    "  return <div />;",
    "}",
    "",
  ].join("\n");
}

function domainTypeSource(): string {
  return [
    "interface TestDomain extends DomainDescriptor {",
    '  id: "github-triage";',
    "  entities: { Issue: { id: string; title: string } };",
    "  queries: {",
    '    "issue.openQueue": {',
    "      args: Record<string, unknown>;",
    '      row: TestDomain["entities"]["Issue"];',
    "    };",
    "  };",
    "  processes: {};",
    "  events: {};",
    "  effects: {};",
    '  permissions: "issue.read";',
    "}",
  ].join("\n");
}
