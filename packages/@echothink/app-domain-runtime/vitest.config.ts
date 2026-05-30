import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@echothink/shared-types": resolve(
        __dirname,
        "../shared-types/src/index.ts",
      ),
      "@echothink/domain-manifest": resolve(
        __dirname,
        "../domain-manifest/src/index.ts",
      ),
      "@echothink/app-domain-sdk": resolve(
        __dirname,
        "../app-domain-sdk/src/index.ts",
      ),
    },
  },
});
