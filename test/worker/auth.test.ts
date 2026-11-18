import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import app from "../../src/worker/app";
import { resolveEmail, teamOrigin } from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";
import { resetDb } from "./helpers";

const TEAM = "https://team.cloudflareaccess.com";
const AUD = "aud-123";
const prod = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } as Env;

async function setup(issuer = TEAM) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" };
  const getKey = createLocalJWKSet({ keys: [jwk] });
  const sign = (aud: string, email: string | null = "Gideon@Example.com") =>
    new SignJWT(email === null ? {} : { email })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(issuer)
      .setAudience(aud)
      .setExpirationTime("1h")
      .sign(privateKey);
  return { getKey, sign, privateKey, jwks: { keys: [jwk] } };
}

describe("resolveEmail", () => {
  it("accepts a valid Access JWT and lowercases the email", async () => {
    const { getKey, sign } = await setup();
    const req = new Request("http://x/", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD) } });
    expect(await resolveEmail(req, prod, getKey)).toBe("gideon@example.com");
  });

  it("falls back to the CF_Authorization cookie", async () => {
    const { getKey, sign } = await setup();
    const req = new Request("http://x/", { headers: { cookie: `a=b; CF_Authorization=${await sign(AUD)}` } });
    expect(await resolveEmail(req, prod, getKey)).toBe("gideon@example.com");
  });

  it("rejects a JWT with the wrong audience", async () => {
    const { getKey, sign } = await setup();
    const req = new Request("http://x/", { headers: { "Cf-Access-Jwt-Assertion": await sign("other") } });
    await expect(resolveEmail(req, prod, getKey)).rejects.toMatchObject({
      status: 401,
      cause: { code: "unauthenticated" },
    });
  });

  it("rejects a JWT without an email claim", async () => {
    const { getKey, sign } = await setup();
    const req = new Request("http://x/", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD, null) } });
    await expect(resolveEmail(req, prod, getKey)).rejects.toMatchObject({
      status: 401,
      cause: { code: "unauthenticated" },
    });
  });

  it("rejects a missing token in production mode even if DEV_USER_EMAIL is set", async () => {
    const { getKey } = await setup();
    await expect(
      resolveEmail(new Request("http://x/"), { ...prod, DEV_USER_EMAIL: "dev@example.com" }, getKey),
    ).rejects.toMatchObject({ status: 401, cause: { code: "unauthenticated" } });
  });

  it("fails with 500 when only one Access var is set, never using DEV_USER_EMAIL", async () => {
    for (const partial of [
      { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: "" },
      { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: TEAM },
      { ACCESS_AUD: AUD },
      { ACCESS_TEAM_DOMAIN: TEAM },
      { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" },
    ]) {
      const partialEnv = { ...partial, DEV_USER_EMAIL: "dev@example.com" } as Env;
      await expect(resolveEmail(new Request("http://x/"), partialEnv)).rejects.toMatchObject({
        status: 500,
        cause: { code: "auth_not_configured" },
      });
    }
  });

  it("uses DEV_USER_EMAIL when Access is not configured", async () => {
    const devEnv = { DEV_USER_EMAIL: "Dev@Example.com" } as Env;
    expect(await resolveEmail(new Request("http://x/"), devEnv)).toBe("dev@example.com");
  });

  it("fails with 500 when nothing is configured", async () => {
    await expect(resolveEmail(new Request("http://x/"), {} as Env)).rejects.toMatchObject({
      status: 500,
      cause: { code: "auth_not_configured" },
    });
  });

  it("accepts a team domain with a trailing slash or without a scheme", async () => {
    const { getKey, sign } = await setup();
    for (const domain of [`${TEAM}/`, "team.cloudflareaccess.com", "team.cloudflareaccess.com/"]) {
      const req = new Request("http://x/", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD) } });
      const domainEnv = { ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: AUD } as Env;
      expect(await resolveEmail(req, domainEnv, getKey)).toBe("gideon@example.com");
    }
  });
});

describe("teamOrigin", () => {
  it("normalizes to an https origin", () => {
    expect(teamOrigin("https://team.cloudflareaccess.com/")).toBe(TEAM);
    expect(teamOrigin("team.cloudflareaccess.com")).toBe(TEAM);
    expect(teamOrigin("  team.cloudflareaccess.com/  ")).toBe(TEAM);
  });
});

describe("identity middleware with Cloudflare Access", () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  let n = 0;
  /** A fresh team per test, so the module-level JWKS cache never leaks between tests. */
  async function accessEnv(fetchImpl?: (url: string) => Promise<Response>) {
    const team = `https://team${++n}-${Date.now()}.cloudflareaccess.com`;
    const keys = await setup(team);
    const certs: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      certs.push(url);
      if (fetchImpl) return fetchImpl(url);
      return Response.json(keys.jwks);
    });
    const vars = { ...env, ACCESS_TEAM_DOMAIN: `${team}/`, ACCESS_AUD: AUD, DEV_USER_EMAIL: "dev@example.com" };
    return { ...keys, team, vars, certs };
  }

  it("401 without a token, even when DEV_USER_EMAIL is set", async () => {
    const { vars } = await accessEnv();
    const res = await app.request("/api/me", {}, vars);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("500 auth_not_configured when one Access var is empty", async () => {
    const res = await app.request(
      "/api/me",
      {},
      { ...env, ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: AUD, DEV_USER_EMAIL: "dev@example.com" },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "auth_not_configured" });
  });

  it("200 with a valid token, fetching certs from the normalized team origin", async () => {
    const { vars, sign, team, certs } = await accessEnv();
    const res = await app.request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD) } }, vars);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "gideon@example.com" });
    expect(certs).toEqual([`${team}/cdn-cgi/access/certs`]);
  });

  it("401 for an expired token", async () => {
    const { vars, team, privateKey } = await accessEnv();
    const token = await new SignJWT({ email: "a@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(team)
      .setAudience(AUD)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    const res = await app.request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": token } }, vars);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("500 (not 401) when the certs endpoint cannot be reached", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { vars, sign } = await accessEnv(async () => {
      throw new TypeError("network down");
    });
    const res = await app.request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD) } }, vars);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "auth_unavailable" });
    expect(errors).toHaveBeenCalled();
  });

  it("caches the JWKS per team origin across requests", async () => {
    const { vars, sign, certs } = await accessEnv();
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/api/me", { headers: { "Cf-Access-Jwt-Assertion": await sign(AUD) } }, vars);
      expect(res.status).toBe(200);
    }
    expect(certs).toHaveLength(1);
  });
});
