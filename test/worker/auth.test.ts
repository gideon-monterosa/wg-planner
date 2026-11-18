import { describe, it, expect } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { resolveEmail } from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";

const TEAM = "https://team.cloudflareaccess.com";
const AUD = "aud-123";
const prod = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } as Env;

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" };
  const getKey = createLocalJWKSet({ keys: [jwk] });
  const sign = (aud: string, email = "Gideon@Example.com") =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(TEAM)
      .setAudience(aud)
      .setExpirationTime("1h")
      .sign(privateKey);
  return { getKey, sign };
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
    await expect(resolveEmail(req, prod, getKey)).rejects.toThrow();
  });

  it("rejects a missing token in production mode even if DEV_USER_EMAIL is set", async () => {
    const { getKey } = await setup();
    await expect(
      resolveEmail(new Request("http://x/"), { ...prod, DEV_USER_EMAIL: "dev@example.com" }, getKey),
    ).rejects.toThrow();
  });

  it("uses DEV_USER_EMAIL when Access is not configured", async () => {
    const env = { DEV_USER_EMAIL: "Dev@Example.com" } as Env;
    expect(await resolveEmail(new Request("http://x/"), env)).toBe("dev@example.com");
  });

  it("fails with 500 when nothing is configured", async () => {
    await expect(resolveEmail(new Request("http://x/"), {} as Env)).rejects.toMatchObject({ status: 500 });
  });
});
