import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/shared/**/*.test.ts", "test/web/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
