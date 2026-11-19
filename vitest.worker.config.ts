import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-09-21",
          // MIGRATION_DB: an empty database for tests that apply migrations step by step.
          d1Databases: ["DB", "MIGRATION_DB"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/worker/apply-migrations.ts"],
    },
  };
});
