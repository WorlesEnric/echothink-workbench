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
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { dependencyAllowlistGate } from "./gates/dependency-allowlist.js";
import { securityImportsGate } from "./gates/security-imports.js";
import type { GateContext } from "./types.js";

const NOW = "2026-05-29T12:00:00.000Z";
const fixtureManifest = readFileSync(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
  "utf8",
);

describe("securityImportsGate", () => {
  it("flags every forbidden frontend pattern and illegal imports with file lines", async () => {
    const { ctx, entry } = createSurfaceContext();
    writeFileSync(
      entry,
      [
        'import { PrismaClient } from "@prisma/client";',
        'import { createClient } from "@supabase/supabase-js";',
        'import fs from "node:fs";',
        'import leftPad from "left-pad";',
        'fetch("/api");',
        'axios.get("/api");',
        'new WebSocket("wss://example.com");',
        'new EventSource("/events");',
        'localStorage.setItem("token", "secret");',
        "process.env.SECRET;",
        'eval("1 + 1");',
        'new Function("return 1");',
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await securityImportsGate.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FORBIDDEN_IMPORT", line: 1 }),
        expect.objectContaining({ code: "FORBIDDEN_IMPORT", line: 2 }),
        expect.objectContaining({ code: "FORBIDDEN_IMPORT", line: 3 }),
        expect.objectContaining({ code: "ILLEGAL_IMPORT", line: 4 }),
        expect.objectContaining({ code: "FORBIDDEN_FETCH", line: 5 }),
        expect.objectContaining({ code: "FORBIDDEN_AXIOS", line: 6 }),
        expect.objectContaining({ code: "FORBIDDEN_WEBSOCKET", line: 7 }),
        expect.objectContaining({ code: "FORBIDDEN_EVENTSOURCE", line: 8 }),
        expect.objectContaining({ code: "FORBIDDEN_TOKEN_STORAGE", line: 9 }),
        expect.objectContaining({ code: "FORBIDDEN_PROCESS_ENV", line: 10 }),
        expect.objectContaining({ code: "FORBIDDEN_EVAL", line: 11 }),
        expect.objectContaining({
          code: "FORBIDDEN_FUNCTION_CONSTRUCTOR",
          line: 12,
        }),
      ]),
    );
  });

  it("passes a clean SDK-only surface file", async () => {
    const { ctx, entry } = createSurfaceContext();
    writeFileSync(
      entry,
      [
        'import type { SdkRequest } from "@echothink/app-domain-sdk";',
        "export const request = {} as SdkRequest;",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await securityImportsGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("ignores generated story and surface test evidence files", async () => {
    const { ctx, entry } = createSurfaceContext();
    writeFileSync(entry, "export const TriageConsole = () => null;\n", "utf8");
    writeFileSync(
      join(dirname(entry), "stories.tsx"),
      'import leftPad from "left-pad";\n',
      "utf8",
    );
    writeFileSync(
      join(dirname(entry), "tests.spec.tsx"),
      'import { describe } from "vitest";\n',
      "utf8",
    );

    const result = await securityImportsGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("ignores vitest imports in surface spec files", async () => {
    const { ctx, entry } = createSurfaceContext();
    writeFileSync(
      join(dirname(entry), "tests.spec.tsx"),
      [
        'import { describe, expect, it } from "vitest";',
        'import * as surfaceModule from "./index";',
        'describe("surface", () => {',
        '  it("exports", () => {',
        "    expect(surfaceModule).toBeDefined();",
        "  });",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );

    const securityResult = await securityImportsGate.run(ctx);
    const dependencyResult = await dependencyAllowlistGate.run(ctx);
    expect(securityResult.status).toBe("pass");
    expect(securityResult.findings).toEqual([]);
    expect(dependencyResult.status).toBe("pass");
    expect(dependencyResult.findings).toEqual([]);
  });
});

function createSurfaceContext(): { ctx: GateContext; entry: string } {
  const domainDir = mkdtempSync(join(tmpdir(), "echothink-security-"));
  const entry = join(domainDir, "surfaces/composed/triage-console/index.tsx");
  mkdirSync(dirname(entry), { recursive: true });
  const compiled = compileManifest(parseManifestYaml(fixtureManifest).manifest, {
    now: NOW,
  });
  return {
    entry,
    ctx: {
      domainDir,
      compiled,
      surfaces: compiled.surfaceRegistrations,
      runId: "security-test",
      now: NOW,
    },
  };
}
