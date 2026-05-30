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
      // Resolve the workspace dependency to its source for fast iteration in tests.
      "@echothink/shared-types": resolve(
        __dirname,
        "../shared-types/src/index.ts",
      ),
    },
  },
});
