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
      "@echothink/validation": resolve(
        __dirname,
        "../validation/src/index.ts",
      ),
    },
  },
});
