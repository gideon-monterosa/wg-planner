import { beforeEach, describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { Room } from "../../src/shared/types";
import { api, post, resetDb } from "./helpers";

beforeEach(resetDb);

async function seed(): Promise<Room[]> {
  await api("/api/me", { as: "gideon@example.com" }); // bootstrap: creates Gideon + own room
  await env.DB.prepare("DELETE FROM rooms").run();
  await env.DB.batch(
    ["Kitchen", "Living room", "Bathroom", "Hallway"].map((n, i) =>
      env.DB.prepare("INSERT INTO rooms (name, sort) VALUES (?, ?)").bind(n, i + 1),
    ),
  );
  return list();
}

async function list(): Promise<Room[]> {
  return (await (await api("/api/rooms")).json()) as Room[];
}

describe("rooms API", () => {
  it("lists rooms in sort order", async () => {
    const rooms = await seed();
    expect(rooms.map((r) => r.name)).toEqual(["Kitchen", "Living room", "Bathroom", "Hallway"]);
  });

  it("creates a room appended at the end", async () => {
    await seed();
    const res = await api("/api/rooms", { method: "POST", body: { name: " Attic ", personId: null } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Attic", personId: null, sort: 5 });
  });

  it("creates the first room with sort 1", async () => {
    await api("/api/me");
    await env.DB.prepare("DELETE FROM rooms").run();
    const room = await post<Room>("/api/rooms", { name: "Solo", personId: null });
    expect(room.sort).toBe(1);
  });

  it("reorders rooms", async () => {
    const rooms = await seed();
    const ids = rooms.map((r) => r.id).reverse();
    const res = await api("/api/rooms/order", { method: "PUT", body: { ids } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Room[]).map((r) => r.id)).toEqual(ids);
    expect((await list())[0].name).toBe("Hallway");
  });

  it("rejects an order that misses a room", async () => {
    const rooms = await seed();
    const ids = rooms.slice(1).map((r) => r.id);
    expect((await api("/api/rooms/order", { method: "PUT", body: { ids } })).status).toBe(400);
    expect(
      (await api("/api/rooms/order", { method: "PUT", body: { ids: [...ids, ids[0]] } })).status,
    ).toBe(400);
    expect((await list()).map((r) => r.id)).toEqual(rooms.map((r) => r.id));
  });

  it("renames a room and marks it as someone's room", async () => {
    const [kitchen] = await seed();
    const me = (await (await api("/api/me")).json()) as { id: number };
    const res = await api(`/api/rooms/${kitchen.id}`, {
      method: "PATCH",
      body: { name: "Big kitchen", personId: me.id },
    });
    expect(await res.json()).toMatchObject({ id: kitchen.id, name: "Big kitchen", personId: me.id });
    const cleared = await api(`/api/rooms/${kitchen.id}`, { method: "PATCH", body: { personId: null } });
    expect(await cleared.json()).toMatchObject({ name: "Big kitchen", personId: null });
  });

  it("rejects unknown people, bad ids and missing rooms", async () => {
    const [kitchen] = await seed();
    expect(
      (await api(`/api/rooms/${kitchen.id}`, { method: "PATCH", body: { personId: 999 } })).status,
    ).toBe(400);
    expect((await api("/api/rooms", { method: "POST", body: { name: "x", personId: 999 } })).status).toBe(400);
    expect((await api("/api/rooms/abc", { method: "PATCH", body: { name: "x" } })).status).toBe(404);
    expect((await api("/api/rooms/abc", { method: "DELETE" })).status).toBe(404);
    expect((await api("/api/rooms/9999", { method: "PATCH", body: { name: "x" } })).status).toBe(404);
    expect((await api("/api/rooms/9999", { method: "DELETE" })).status).toBe(404);
  });

  it("deleting a room keeps its items under no room", async () => {
    const [kitchen] = await seed();
    const me = (await (await api("/api/me")).json()) as { id: number };
    await env.DB.prepare("INSERT INTO items (name, room_id, created_by) VALUES ('Kettle', ?, ?)")
      .bind(kitchen.id, me.id)
      .run();
    const res = await api(`/api/rooms/${kitchen.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const item = await env.DB.prepare("SELECT room_id FROM items WHERE name = 'Kettle'").first<{
      room_id: number | null;
    }>();
    expect(item).toEqual({ room_id: null });
    expect(await list()).toHaveLength(3);
  });

  it("returns {error: invalid_body, message} for a bad body on every write", async () => {
    const rooms = await seed();
    const cases = [
      api("/api/rooms", { method: "POST", body: { name: "", personId: null } }),
      api("/api/rooms/order", { method: "PUT", body: { ids: "nope" } }),
      api(`/api/rooms/${rooms[0].id}`, { method: "PATCH", body: { name: 42 } }),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ error: "invalid_body" });
      expect(typeof body.message).toBe("string");
    }
  });
});
