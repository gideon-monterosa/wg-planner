import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode }) => ({
  worker: {
    name: "wg-planner",
    compatibilityDate: "2026-09-21",
    entrypoint,
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    env: {
      DB: bindings.d1({ name: "wg-planner" }),
      ...(mode === "production"
        ? {
            // Filled in when Cloudflare Access is set up (Task 14).
            ACCESS_TEAM_DOMAIN: bindings.text(""),
            ACCESS_AUD: bindings.text(""),
          }
        : {}),
    },
  },
}));
