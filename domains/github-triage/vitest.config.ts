import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@echothink/shared-types": resolve(
        __dirname,
        "../../packages/@echothink/shared-types/src/index.ts",
      ),
      "@echothink/domain-manifest": resolve(
        __dirname,
        "../../packages/@echothink/domain-manifest/src/index.ts",
      ),
      "@echothink/app-domain-sdk": resolve(
        __dirname,
        "../../packages/@echothink/app-domain-sdk/src/index.ts",
      ),
      "@echothink/app-domain-runtime/preview": resolve(
        __dirname,
        "../../packages/@echothink/app-domain-runtime/src/preview/index.ts",
      ),
      "@echothink/app-domain-runtime": resolve(
        __dirname,
        "../../packages/@echothink/app-domain-runtime/src/index.ts",
      ),
    },
  },
});
