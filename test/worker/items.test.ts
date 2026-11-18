import { beforeEach, describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { ItemDetail, ItemSummary, Person } from "../../src/shared/types";
import { api, post, resetDb } from "./helpers";

const LENA = "lena@example.com";

let gideon: number;
let lena: number;
let kitchen: number;
let gideonsRoom: number;

beforeEach(async () => {
  await resetDb();
  gideon = ((await (await api("/api/me")).json()) as Person).id;
  lena = (await post<Person>("/api/people", { name: "Lena", email: LENA })).id;
  const k = await env.DB.prepare("INSERT INTO rooms (name, sort) VALUES ('Kitchen', 1) RETURNING id").first<{ id: number }>();
  kitchen = k!.id;
  const g = await env.DB.prepare("SELECT id FROM rooms WHERE person_id = ?").bind(gideon).first<{ id: number }>();
  gideonsRoom = g!.id;
});

function patch(id: number, body: unknown, as?: string) {
  return api(`/api/items/${id}`, { method: "PATCH", body, as });
}

async function patchOk(id: number, body: unknown): Promise<ItemDetail> {
  const res = await patch(id, body);
  expect(res.status).toBe(200);
  return (await res.json()) as ItemDetail;
}

describe("creating items", () => {
  it("new item in my own room defaults to just me and hidden", async () => {
    const res = await api("/api/items", { method: "POST", body: { name: "Bed frame", roomId: gideonsRoom } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      forPersonId: gideon,
      visibleToAll: false,
      payer: { kind: "person", personId: gideon },
      canEdit: true,
      status: "needed",
      quantity: 1,
      ideas: [],
    });
  });

  it("new item in a shared room defaults to everyone with no payer", async () => {
    const item = await post<ItemDetail>("/api/items", { name: "Toaster", roomId: kitchen });
    expect(item).toMatchObject({ roomId: kitchen, forPersonId: null, payer: { kind: "none" } });
  });

  it("new item in someone else's room defaults to everyone", async () => {
    const lenasRoom = (await env.DB.prepare("SELECT id FROM rooms WHERE person_id = ?").bind(lena).first<{ id: number }>())!.id;
    expect(await post("/api/items", { name: "Lamp", roomId: lenasRoom })).toMatchObject({ forPersonId: null });
  });

  it("quick add with name only lands in no room as shared", async () => {
    expect(await post("/api/items", { name: "Pan" })).toMatchObject({ roomId: null, forPersonId: null });
  });

  it("rejects an unknown room and an empty name", async () => {
    expect((await api("/api/items", { method: "POST", body: { name: "X", roomId: 99999 } })).status).toBe(400);
    expect((await api("/api/items", { method: "POST", body: { name: "  " } })).status).toBe(400);
  });
});

describe("privacy", () => {
  it("a hidden personal item is invisible to others everywhere", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Desk", forMe: true })).id;
    const lenaList = (await (await api("/api/items", { as: LENA })).json()) as ItemSummary[];
    expect(lenaList.map((i) => i.id)).not.toContain(id);
    expect((await api(`/api/items/${id}`, { as: LENA })).status).toBe(404);
    expect((await patch(id, { name: "x" }, LENA)).status).toBe(404);
    expect((await patch(id, { quantity: 0 }, LENA)).status).toBe(404);
    expect((await api(`/api/items/${id}`, { as: LENA, method: "DELETE" })).status).toBe(404);
    const mine = (await (await api("/api/items")).json()) as ItemSummary[];
    expect(mine.map((i) => i.id)).toContain(id);
  });

  it("show to everyone makes it visible but read-only for others", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Desk", forMe: true })).id;
    expect(await patchOk(id, { visibleToAll: true })).toMatchObject({ visibleToAll: true, canEdit: true });
    const res = await api(`/api/items/${id}`, { as: LENA });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, canEdit: false });
    const list = (await (await api("/api/items", { as: LENA })).json()) as ItemSummary[];
    expect(list.find((i) => i.id === id)).toMatchObject({ canEdit: false });
    const denied = await patch(id, { name: "x" }, LENA);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "read_only" });
    expect((await api(`/api/items/${id}`, { as: LENA, method: "DELETE" })).status).toBe(403);
  });

  it("switching a shared item to just me keeps it visible", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Rug", roomId: kitchen })).id;
    await patchOk(id, { payer: { kind: "together" } });
    expect(await patchOk(id, { forMe: true })).toMatchObject({
      forPersonId: gideon,
      visibleToAll: true,
      payer: { kind: "person", personId: gideon },
    });
    expect((await api(`/api/items/${id}`, { as: LENA })).status).toBe(200);
  });

  it("switching a personal item to everyone makes it shared and editable by others", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Desk", forMe: true })).id;
    expect(await patchOk(id, { forMe: false })).toMatchObject({ forPersonId: null });
    const res = await patch(id, { name: "Shared desk" }, LENA);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Shared desk", canEdit: true });
  });

  it("rejects payer changes on personal items and visibleToAll on shared items", async () => {
    const mine = (await post<ItemDetail>("/api/items", { name: "Desk", forMe: true })).id;
    expect((await patch(mine, { payer: { kind: "together" } })).status).toBe(400);
    const shared = (await post<ItemDetail>("/api/items", { name: "Pan" })).id;
    expect((await patch(shared, { visibleToAll: true })).status).toBe(400);
  });

  it("returns 404 for unknown and non-numeric ids", async () => {
    expect((await api("/api/items/99999")).status).toBe(404);
    expect((await api("/api/items/abc")).status).toBe(404);
    expect((await patch(Number.NaN, { name: "x" })).status).toBe(404);
    expect((await api("/api/items/1.5", { method: "DELETE" })).status).toBe(404);
  });
});

describe("prices and payer", () => {
  it("marking bought fills price paid from the own price × quantity", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Chair", ownPriceCents: 1900 })).id;
    await patchOk(id, { quantity: 2 });
    expect(await patchOk(id, { status: "bought" })).toMatchObject({
      status: "bought",
      pricePaidCents: 3800,
      price: { kind: "paid", cents: 3800 },
      plannedCents: 3800,
      spentCents: 3800,
    });
  });

  it("an explicit price paid wins over the default", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Chair", ownPriceCents: 1900 })).id;
    expect(await patchOk(id, { status: "bought", pricePaidCents: 1500 })).toMatchObject({ pricePaidCents: 1500 });
  });

  it("uses the favorite idea's price when marking bought", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Sofa", ownPriceCents: 1000 })).id;
    await env.DB.prepare(
      "INSERT INTO ideas (item_id, title, price_cents, is_favorite, created_by) VALUES (?, 'A', 20000, 1, ?), (?, 'B', 30000, 0, ?)",
    )
      .bind(id, gideon, id, gideon)
      .run();
    const before = (await (await api(`/api/items/${id}`)).json()) as ItemDetail;
    expect(before).toMatchObject({ ideaCount: 2, price: { kind: "favorite", cents: 20000 } });
    expect(before.ideas).toHaveLength(2);
    const list = (await (await api("/api/items")).json()) as ItemSummary[];
    expect(list.find((i) => i.id === id)).toMatchObject({ ideaCount: 2, plannedCents: 20000 });
    expect(await patchOk(id, { status: "bought" })).toMatchObject({ pricePaidCents: 20000 });
  });

  it("owned items report no price", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Kettle", ownPriceCents: 2500 })).id;
    expect(await patchOk(id, { status: "owned", payer: { kind: "person", personId: lena } })).toMatchObject({
      status: "owned",
      price: { kind: "none" },
      plannedCents: 0,
      spentCents: 0,
      payer: { kind: "person", personId: lena },
    });
  });

  it("paid together is stored and returned", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Fridge" })).id;
    expect(await patchOk(id, { payer: { kind: "together" } })).toMatchObject({ payer: { kind: "together" } });
    const row = await env.DB.prepare("SELECT payer_person_id, paid_together FROM items WHERE id = ?").bind(id).first();
    expect(row).toEqual({ payer_person_id: null, paid_together: 1 });
    expect(await patchOk(id, { payer: { kind: "none" } })).toMatchObject({ payer: { kind: "none" } });
  });

  it("rejects an unknown payer person", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Fridge" })).id;
    expect((await patch(id, { payer: { kind: "person", personId: 99999 } })).status).toBe(400);
  });

  it("rejects quantity 0 and negative prices", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Chair" })).id;
    expect((await patch(id, { quantity: 0 })).status).toBe(400);
    expect((await patch(id, { quantity: 1.5 })).status).toBe(400);
    expect((await patch(id, { ownPriceCents: -1 })).status).toBe(400);
    expect((await patch(id, { pricePaidCents: -5 })).status).toBe(400);
    expect((await api("/api/items", { method: "POST", body: { name: "X", ownPriceCents: -1 } })).status).toBe(400);
    expect(await patchOk(id, { ownPriceCents: null, notes: "IKEA" })).toMatchObject({ ownPriceCents: null, notes: "IKEA" });
  });
});

describe("updating and deleting", () => {
  it("patches name, room and notes and bumps updated_at", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Pan" })).id;
    await env.DB.prepare("UPDATE items SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").bind(id).run();
    expect(await patchOk(id, { name: "Big pan", roomId: kitchen })).toMatchObject({ name: "Big pan", roomId: kitchen });
    const row = await env.DB.prepare("SELECT updated_at FROM items WHERE id = ?").bind(id).first<{ updated_at: string }>();
    expect(row!.updated_at).not.toBe("2000-01-01 00:00:00");
    expect(await patchOk(id, { roomId: null })).toMatchObject({ roomId: null });
  });

  it("deletes an item with its ideas", async () => {
    const id = (await post<ItemDetail>("/api/items", { name: "Pan" })).id;
    await env.DB.prepare("INSERT INTO ideas (item_id, title, created_by) VALUES (?, 'A', ?)").bind(id, gideon).run();
    expect((await api(`/api/items/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(`/api/items/${id}`)).status).toBe(404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM ideas WHERE item_id = ?").bind(id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
});
