import { bindings, defineConfig } from "cf/config";
import environments from "./environments.json" with { type: "json" };
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// One block per mode in environments.json. `null` means "don't bind": development
// keeps ACCESS_* unbound so the Worker uses DEV_USER_EMAIL. Integration and
// production always bind ACCESS_* (even as "", which fails closed with 500).
type Environment = {
  worker: string;
  d1Name: string;
  d1Id: string;
  accessTeamDomain: string | null;
  accessAud: string | null;
};

const ENVIRONMENTS: Record<string, Environment> = environments;

function selectEnvironment(mode: string | undefined): Environment {
  const environment = mode !== undefined && Object.hasOwn(ENVIRONMENTS, mode) ? ENVIRONMENTS[mode] : undefined;
  if (!environment) {
    throw new Error(
      `Unknown mode "${mode}". Expected one of: ${Object.keys(ENVIRONMENTS).join(", ")} (see environments.json).`,
    );
  }
  if (mode !== "development" && (environment.accessTeamDomain === null || environment.accessAud === null)) {
    throw new Error(
      `environments.json: ${mode}.accessTeamDomain and ${mode}.accessAud must not be null. Only development may skip Cloudflare Access.`,
    );
  }
  return environment;
}

export default defineConfig(({ mode }) => {
  const environment = selectEnvironment(mode);
  const { accessTeamDomain, accessAud } = environment;

  return {
    worker: {
      name: environment.worker,
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
        // The development ID is the fixed local database that `cf dev` and
        // `mise run db:migrate` share under .cloudflare/state.
        DB: bindings.d1({ name: environment.d1Name, id: environment.d1Id || undefined }),
        ...(accessTeamDomain !== null ? { ACCESS_TEAM_DOMAIN: bindings.text(accessTeamDomain) } : {}),
        ...(accessAud !== null ? { ACCESS_AUD: bindings.text(accessAud) } : {}),
        // Vite plugin 2 only loads .dev.vars values for declared secrets. Declared
        // only while Access is unbound, the only case in which the Worker reads it.
        ...(accessTeamDomain === null && accessAud === null ? { DEV_USER_EMAIL: bindings.secret() } : {}),
      },
    },
  };
});
