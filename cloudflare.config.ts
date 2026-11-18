import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// Fixed ID for the local dev database. `cf dev` stores local D1 data under
// .wrangler/state keyed by this ID, and `mise run db:migrate` targets the same
// ID and directory, so migrations land in the database the dev server serves.
const LOCAL_D1_ID = "3f2a9c1e-7b4d-4e8a-9c6b-1d2e3f4a5b6c";

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
      DB: bindings.d1({
        name: "wg-planner",
        ...(mode === "production" ? {} : { id: LOCAL_D1_ID }),
      }),
      ...(mode === "production"
        ? {
            // Filled in when Cloudflare Access is set up (Task 14).
            ACCESS_TEAM_DOMAIN: bindings.text(""),
            ACCESS_AUD: bindings.text(""),
          }
        : {
            // Vite plugin 2 only loads .dev.vars values for declared secrets.
            DEV_USER_EMAIL: bindings.secret(),
          }),
    },
  },
}));
