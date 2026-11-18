import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Person } from "../shared/types";
import type { AppEnv, Env } from "./env";
import { fail } from "./http";

function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** Returns the caller's lowercase email, verified via Access JWT (production) or DEV_USER_EMAIL (dev). */
export async function resolveEmail(
  req: Request,
  env: Env,
  getKey?: JWTVerifyGetKey,
): Promise<string> {
  if (env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) {
    const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? cookie(req, "CF_Authorization");
    if (!token) fail(401, "unauthenticated", "Missing Access token");
    const domain = env.ACCESS_TEAM_DOMAIN.startsWith("http")
      ? env.ACCESS_TEAM_DOMAIN
      : `https://${env.ACCESS_TEAM_DOMAIN}`;
    const key = getKey ?? createRemoteJWKSet(new URL("/cdn-cgi/access/certs", domain));
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: domain,
        audience: env.ACCESS_AUD,
      });
      if (typeof payload.email !== "string" || !payload.email) throw new Error("no email claim");
      return payload.email.toLowerCase();
    } catch {
      fail(401, "unauthenticated", "Invalid Access token");
    }
  }
  if (env.DEV_USER_EMAIL) return env.DEV_USER_EMAIL.toLowerCase();
  return fail(500, "auth_not_configured", "Neither Cloudflare Access nor DEV_USER_EMAIL is configured");
}

export const PERSON_COLUMNS = "id, name, email, sort";

/** Inserts a person plus their own room in one atomic batch; false if the email already exists. */
export async function insertPerson(db: D1Database, name: string, email: string): Promise<boolean> {
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO people (name, email, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM people))",
        )
        .bind(name, email),
      db
        .prepare(
          "INSERT INTO rooms (name, person_id, sort) VALUES (?, (SELECT id FROM people WHERE email = ?), (SELECT COALESCE(MAX(sort), 0) + 1 FROM rooms))",
        )
        .bind(`${name}'s room`, email),
    ]);
    return true;
  } catch (e) {
    if (String(e).includes("UNIQUE")) return false;
    throw e;
  }
}

export const identity: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === "/api/health") return next();
  const email = await resolveEmail(c.req.raw, c.env);
  const find = () =>
    c.env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE email = ?`).bind(email).first<Person>();
  let me = await find();
  if (!me) {
    const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM people").first<{ n: number }>();
    if ((row?.n ?? 0) > 0) fail(403, "not_set_up", "You have not been added yet", { email });
    await insertPerson(c.env.DB, email.split("@")[0]!, email); // bootstrap first visitor
    me = await find();
    if (!me) fail(403, "not_set_up", "You have not been added yet", { email });
  }
  c.set("me", me);
  return next();
};
