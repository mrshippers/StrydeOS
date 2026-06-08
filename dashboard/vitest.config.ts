import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

// Live-LLM integration suites make real (paid) Anthropic calls and need a funded
// key. They are excluded from the default hermetic run and only execute when
// RUN_LLM_TESTS=1 (see the `test:llm` script).
const LLM_TEST_FILES = [
  "**/lib/ava/__tests__/graph.test.ts",
  "**/lib/ava/__tests__/graph-nodes.test.ts",
];
const runLlmTests = process.env.RUN_LLM_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...(runLlmTests ? [] : LLM_TEST_FILES)],
    testTimeout: 15_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: false } },
  },
});
