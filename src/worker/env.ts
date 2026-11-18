import type { Person } from "../shared/types";

export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_USER_EMAIL?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { me: Person };
}
