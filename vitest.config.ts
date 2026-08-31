import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": `${repoRoot}src`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/modules/**/*.ts"],
    },
  },
});
