import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@echothink/shared-types": resolve(
        __dirname,
        "../shared-types/src/index.ts",
      ),
    },
  },
});
