import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Server integration tests against a real Postgres (TEST_DATABASE_URL). Fresh database per run.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["src/server/**/*.itest.ts"],
    globalSetup: ["./src/server/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5499/kk_itest",
      APP_URL: "http://localhost:3123",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
      CRON_SECRET: "cron-secret-for-tests-only-123456",
      RAZORPAY_WEBHOOK_SECRET: "whsec_test_only",
    },
  },
});
