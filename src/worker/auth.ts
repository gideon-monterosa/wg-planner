import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
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

/** Normalizes a team domain ("team.cloudflareaccess.com", "https://team.cloudflareaccess.com/") to its https origin. */
export function teamOrigin(domain: string): string {
  const trimmed = domain.trim();
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin;
}

/** One remote JWKS per team origin, kept across requests so keys are fetched once per isolate. */
const jwksByOrigin = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function remoteJwks(origin: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByOrigin.get(origin);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", origin));
    jwksByOrigin.set(origin, jwks);
  }
  return jwks;
}

/** jose errors caused by the token itself (bad, expired, wrong key, wrong claims): a 401, not a server fault. */
const TOKEN_ERRORS = [
  errors.JWTExpired, // not a JWTClaimValidationFailed subclass in jose 6
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
];

/**
 * Returns the caller's lowercase email, verified via Access JWT (production) or DEV_USER_EMAIL (dev).
 * Production mode starts as soon as either Access var is bound (even as ""), and never reads DEV_USER_EMAIL.
 */
export async function resolveEmail(
  req: Request,
  env: Env,
  getKey?: JWTVerifyGetKey,
): Promise<string> {
  if (env.ACCESS_AUD !== undefined || env.ACCESS_TEAM_DOMAIN !== undefined) {
    if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN?.trim()) {
      fail(500, "auth_not_configured", "Cloudflare Access is only partly configured");
    }
    let origin: string;
    try {
      origin = teamOrigin(env.ACCESS_TEAM_DOMAIN);
    } catch {
      fail(500, "auth_not_configured", "ACCESS_TEAM_DOMAIN is not a valid domain");
    }
    const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? cookie(req, "CF_Authorization");
    if (!token) fail(401, "unauthenticated", "Missing Access token");
    let email: unknown;
    try {
      const { payload } = await jwtVerify(token, getKey ?? remoteJwks(origin), {
        issuer: origin,
        audience: env.ACCESS_AUD,
      });
      email = payload.email;
    } catch (e) {
      if (TOKEN_ERRORS.some((cls) => e instanceof cls)) fail(401, "unauthenticated", "Invalid Access token");
      console.error("Access token verification failed", e);
      fail(500, "auth_unavailable", "Could not verify the Access token");
    }
    if (typeof email !== "string" || !email) fail(401, "unauthenticated", "Invalid Access token");
    return email.toLowerCase();
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
