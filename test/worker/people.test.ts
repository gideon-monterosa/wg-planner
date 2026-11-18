import { beforeEach, describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { Person } from "../../src/shared/types";
import { api, post, resetDb } from "./helpers";

beforeEach(resetDb);

async function seed() {
  await api("/api/me", { as: "gideon@example.com" }); // bootstrap
}

describe("identity", () => {
  it("first visitor on an empty people table is created automatically", async () => {
    const me = await (await api("/api/me", { as: "gideon@example.com" })).json();
    expect(me).toMatchObject({ name: "gideon", email: "gideon@example.com" });
  });

  it("an unknown email gets 403 not_set_up once people exist", async () => {
    await seed();
    const res = await api("/api/me", { as: "stranger@example.com" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "not_set_up", email: "stranger@example.com" });
  });

  it("matches emails case-insensitively", async () => {
    await seed();
    expect((await api("/api/me", { as: "GIDEON@example.com" })).status).toBe(200);
  });

  it("health stays public", async () => {
    await seed();
    expect((await api("/api/health", { as: "stranger@example.com" })).status).toBe(200);
  });
});

describe("people API", () => {
  it("lists people sorted by sort then id", async () => {
    await seed();
    await post("/api/people", { name: "Lena", email: "lena@example.com" });
    const list = (await (await api("/api/people")).json()) as Person[];
    expect(list.map((p) => p.name)).toEqual(["gideon", "Lena"]);
  });

  it("adding a person also creates their room", async () => {
    await seed();
    const lena = await post<Person>("/api/people", { name: "Lena", email: "lena@example.com" });
    const room = await env.DB.prepare("SELECT person_id FROM rooms WHERE name = ?").bind("Lena's room").first();
    expect(room?.person_id).toBe(lena.id);
  });

  it("rejects a duplicate email with 409 and creates no room", async () => {
    await seed();
    await post("/api/people", { name: "Lena", email: "lena@example.com" });
    const res = await api("/api/people", { method: "POST", body: { name: "Lena2", email: "LENA@example.com" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "email_taken" });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM rooms WHERE name = ?")
      .bind("Lena2's room")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("validates the body with 400", async () => {
    await seed();
    const res = await api("/api/people", { method: "POST", body: { name: "", email: "nope" } });
    expect(res.status).toBe(400);
  });

  it("patches name and email, 404 for unknown id, 409 for taken email", async () => {
    await seed();
    const lena = await post<Person>("/api/people", { name: "Lena", email: "lena@example.com" });
    const ok = await api(`/api/people/${lena.id}`, { method: "PATCH", body: { name: "Lena K" } });
    expect(await ok.json()).toMatchObject({ id: lena.id, name: "Lena K", email: "lena@example.com" });
    expect((await api("/api/people/9999", { method: "PATCH", body: { name: "x" } })).status).toBe(404);
    const dup = await api(`/api/people/${lena.id}`, { method: "PATCH", body: { email: "gideon@example.com" } });
    expect(dup.status).toBe(409);
  });
});
