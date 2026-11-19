import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { IdeaWithItem, ItemDetail, ItemSummary, Overview, Person, Room } from "../../src/shared/types";
import { api, post, resetDb } from "./helpers";

const LENA = "lena@example.com";
let gideonId: number;
let lenaId: number;

async function json<T>(res: Response, status = 200): Promise<T> {
  expect(res.status).toBe(status);
  return (await res.json()) as T;
}
const listIdeas = async (as?: string) => json<IdeaWithItem[]>(await api("/api/ideas", { as }));
const createIdea = async (body: unknown, as?: string) =>
  json<IdeaWithItem>(await api("/api/ideas", { method: "POST", body, as }), 201);
const patchIdea = (id: number, body: unknown, as?: string) => api(`/api/ideas/${id}`, { method: "PATCH", body, as });
const getItem = async (id: number, as?: string) => json<ItemDetail>(await api(`/api/items/${id}`, { as }));
const star = async (itemId: number, ideaId: number | null) =>
  json<ItemDetail>(await api(`/api/items/${itemId}/favorite`, { method: "PUT", body: { ideaId } }));

beforeEach(async () => {
  await resetDb();
  gideonId = (await json<Person>(await api("/api/me"))).id;
  lenaId = (await post<Person>("/api/people", { name: "Lena", email: LENA })).id;
});

describe("GET /api/ideas", () => {
  it("lists my unlinked ideas and ideas on items I can see, with an item reference", async () => {
    const room = await post<Room>("/api/rooms", { name: "Studio", personId: null });
    const sofa = await post<ItemDetail>("/api/items", { name: "Sofa", roomId: room.id });
    await post(`/api/items/${sofa.id}/ideas`, { title: "Linked", priceCents: 100 });
    const free = await createIdea({ title: "Free", url: "https://www.shop.de/x", priceCents: 500 });
    expect(free).toMatchObject({
      itemId: null, itemName: null, roomId: null, itemStatus: null, itemForPersonId: null, itemVisibleToAll: null,
      title: "Free", shop: "shop.de", priceCents: 500, isFavorite: false, canEdit: true, canEditItem: false, isMine: true,
    });
    const list = await listIdeas();
    expect(list.map((i) => i.title)).toEqual(["Linked", "Free"]);
    expect(list[0]).toMatchObject({
      itemId: sofa.id, itemName: "Sofa", roomId: room.id, itemStatus: "needed", itemForPersonId: null,
      itemVisibleToAll: false, canEdit: true, canEditItem: true, isMine: true,
    });
    // Lena sees the idea on the shared item (not hers, but editable) and not the unlinked one.
    const hers = await listIdeas(LENA);
    expect(hers.map((i) => i.title)).toEqual(["Linked"]);
    expect(hers[0]).toMatchObject({ canEdit: true, canEditItem: true, isMine: false });
  });

  it("ideas on someone's hidden personal item are invisible; on a shown one they are read-only", async () => {
    const secret = await post<ItemDetail>("/api/items", { name: "Secret", forMe: true });
    await post(`/api/items/${secret.id}/ideas`, { title: "Hidden idea" });
    expect(await listIdeas(LENA)).toEqual([]);
    await api(`/api/items/${secret.id}`, { method: "PATCH", body: { visibleToAll: true } });
    const shown = await listIdeas(LENA);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      title: "Hidden idea", itemForPersonId: gideonId, itemVisibleToAll: true, canEdit: false, canEditItem: false, isMine: false,
    });
  });
});

describe("unlinked idea privacy", () => {
  it("Lena never sees or touches Gideon's unlinked ideas", async () => {
    const free = await createIdea({ title: "Mine" });
    expect(await listIdeas(LENA)).toEqual([]);
    const missing = await patchIdea(99999, { title: "x" }, LENA);
    const hidden = await patchIdea(free.id, { title: "x" }, LENA);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    expect((await patchIdea(free.id, { itemId: null }, LENA)).status).toBe(404);
    expect((await api(`/api/ideas/${free.id}`, { method: "DELETE", as: LENA })).status).toBe(404);
    expect((await api(`/api/ideas/${free.id}/to-item`, { method: "POST", body: {}, as: LENA })).status).toBe(404);
    // A shared item Lena can edit doesn't let her pull Gideon's idea onto it either.
    const shared = await post<ItemDetail>("/api/items", { name: "Shared" }, LENA);
    expect((await patchIdea(free.id, { itemId: shared.id }, LENA)).status).toBe(404);
    expect((await listIdeas())[0]).toMatchObject({ title: "Mine", itemId: null });
  });

  it("404 comes before 400 for invalid bodies on someone else's unlinked idea", async () => {
    const free = await createIdea({ title: "Mine" });
    expect((await patchIdea(free.id, { title: "" }, LENA)).status).toBe(404);
  });

  it("unlinked ideas never show up in item lists, counts or the overview", async () => {
    const lamp = await post<ItemDetail>("/api/items", { name: "Lamp", ownPriceCents: 1000 });
    await createIdea({ title: "Free", priceCents: 999999 });
    const items = await json<ItemSummary[]>(await api("/api/items"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: lamp.id, ideaCount: 0, plannedCents: 1000 });
    expect((await getItem(lamp.id)).ideas).toEqual([]);
    const overview = await json<Overview>(await api("/api/overview"));
    expect(overview.planned.rows.reduce((s, r) => s + r.ownCents + r.sharedCents, 0)).toBe(1000);
  });
});

describe("POST /api/ideas", () => {
  it("falls back to the shop, then the host, when no title is given", async () => {
    expect(await createIdea({ url: "https://www.ikea.com/de/p/1" })).toMatchObject({ title: "ikea.com", shop: "ikea.com" });
    expect(await createIdea({ url: "https://www.ikea.com/de/p/1", shop: "IKEA" })).toMatchObject({ title: "IKEA", shop: "IKEA" });
    expect(await createIdea({ title: "  ", url: "https://a.de/" })).toMatchObject({ title: "a.de" });
    for (const body of [{}, { title: "" }, { url: "" }, { url: "javascript:alert(1)" }, { title: "x", imageUrl: "data:x" }]) {
      const res = await api("/api/ideas", { method: "POST", body });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
    }
  });

  it("links to an item I can edit; hidden is 404, someone's visible personal item is 403", async () => {
    const shared = await post<ItemDetail>("/api/items", { name: "Shared" });
    const linked = await createIdea({ title: "L", itemId: shared.id }, LENA);
    expect(linked).toMatchObject({ itemId: shared.id, itemName: "Shared", isMine: true });
    expect((await getItem(shared.id)).ideas.map((i) => i.title)).toEqual(["L"]);

    const secret = await post<ItemDetail>("/api/items", { name: "Secret", forMe: true });
    const r404 = await api("/api/ideas", { method: "POST", body: { title: "x", itemId: secret.id }, as: LENA });
    expect(r404.status).toBe(404);
    await api(`/api/items/${secret.id}`, { method: "PATCH", body: { visibleToAll: true } });
    const r403 = await api("/api/ideas", { method: "POST", body: { title: "x", itemId: secret.id }, as: LENA });
    expect(r403.status).toBe(403);
    expect(await r403.json()).toMatchObject({ error: "read_only" });
    expect((await getItem(secret.id)).ideas).toEqual([]);
  });

  it("requires a JSON content type", async () => {
    const res = await (await import("../../src/worker/app")).default.request(
      "/api/ideas",
      { method: "POST", body: JSON.stringify({ title: "X" }), headers: { "content-type": "text/plain" } },
      { ...env, DEV_USER_EMAIL: "gideon@example.com" },
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/ideas/:id itemId", () => {
  it("links an unlinked idea and returns the item", async () => {
    const free = await createIdea({ title: "Free", priceCents: 300 });
    const lamp = await post<ItemDetail>("/api/items", { name: "Lamp" });
    const d = await json<ItemDetail>(await patchIdea(free.id, { itemId: lamp.id, title: "Renamed" }));
    expect(d.id).toBe(lamp.id);
    expect(d.ideas).toMatchObject([{ id: free.id, title: "Renamed", itemId: lamp.id, isFavorite: false }]);
  });

  it("linking to someone's hidden item is 404, to their visible personal item 403", async () => {
    const free = await createIdea({ title: "Hers" }, LENA);
    const secret = await post<ItemDetail>("/api/items", { name: "Secret", forMe: true });
    expect((await patchIdea(free.id, { itemId: secret.id }, LENA)).status).toBe(404);
    expect((await patchIdea(free.id, { itemId: 99999 }, LENA)).status).toBe(404);
    await api(`/api/items/${secret.id}`, { method: "PATCH", body: { visibleToAll: true } });
    const res = await patchIdea(free.id, { itemId: secret.id }, LENA);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "read_only" });
    expect((await listIdeas(LENA)).find((i) => i.id === free.id)).toMatchObject({ itemId: null });
  });

  it("moving away from someone's visible personal item needs edit rights on it (403)", async () => {
    const shown = await post<ItemDetail>("/api/items", { name: "Shown", forMe: true });
    await api(`/api/items/${shown.id}`, { method: "PATCH", body: { visibleToAll: true } });
    const d = await post<ItemDetail>(`/api/items/${shown.id}/ideas`, { title: "S" });
    const target = await post<ItemDetail>("/api/items", { name: "Shared" }, LENA);
    expect((await patchIdea(d.ideas[0]!.id, { itemId: target.id }, LENA)).status).toBe(403);
    expect((await patchIdea(d.ideas[0]!.id, { itemId: null }, LENA)).status).toBe(403);
  });

  it("moves an idea between items", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const b = await post<ItemDetail>("/api/items", { name: "B" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    const d = await json<ItemDetail>(await patchIdea(idea.id, { itemId: b.id }));
    expect(d.id).toBe(b.id);
    expect(d.ideas.map((i) => i.id)).toEqual([idea.id]);
    expect((await getItem(a.id)).ideaCount).toBe(0);
  });

  it("moving the favorite clears the star and reverts the old item to needed", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const b = await post<ItemDetail>("/api/items", { name: "B" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    expect((await star(a.id, idea.id)).status).toBe("decided");
    const d = await json<ItemDetail>(await patchIdea(idea.id, { itemId: b.id }));
    expect(d.ideas[0]!.isFavorite).toBe(false);
    expect(d.status).toBe("needed");
    expect(await getItem(a.id)).toMatchObject({ status: "needed", price: { kind: "none" } });
  });

  it("unlinking the favorite clears the star and reverts the status", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    await star(a.id, idea.id);
    const res = await json<IdeaWithItem>(await patchIdea(idea.id, { itemId: null }));
    expect(res).toMatchObject({ id: idea.id, itemId: null, isFavorite: false, canEdit: true });
    expect(await getItem(a.id)).toMatchObject({ status: "needed", ideaCount: 0 });
    expect(await listIdeas(LENA)).toEqual([]);
  });

  it("unlinking a non-favorite keeps the decided status and the favorite", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    let d = await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "Fav", priceCents: 100 });
    d = await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "Other" });
    await star(a.id, d.ideas[0]!.id);
    await patchIdea(d.ideas[1]!.id, { itemId: null });
    expect(await getItem(a.id)).toMatchObject({ status: "decided", ideaCount: 1, price: { kind: "favorite", cents: 100 } });
  });

  it("re-linking to the same item keeps the star", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    await star(a.id, idea.id);
    const d = await json<ItemDetail>(await patchIdea(idea.id, { itemId: a.id }));
    expect(d).toMatchObject({ status: "decided", ideas: [{ isFavorite: true }] });
  });

  it("an unlinked idea can be edited and deleted by its creator", async () => {
    const free = await createIdea({ title: "Free" });
    expect(await json<IdeaWithItem>(await patchIdea(free.id, { notes: "n", priceCents: 5 }))).toMatchObject({
      itemId: null, notes: "n", priceCents: 5,
    });
    expect((await api(`/api/ideas/${free.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await listIdeas()).toEqual([]);
  });

  it("an unlinked idea can't be starred", async () => {
    const lamp = await post<ItemDetail>("/api/items", { name: "Lamp" });
    const free = await createIdea({ title: "Free" });
    const res = await api(`/api/items/${lamp.id}/favorite`, { method: "PUT", body: { ideaId: free.id } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "idea_not_on_item" });
    expect((await getItem(lamp.id)).status).toBe("needed");
  });

  it("only the creator may unlink, move or make an item from an idea; others may still edit its fields", async () => {
    const shared = await post<ItemDetail>("/api/items", { name: "Shared" });
    const idea = (await post<ItemDetail>(`/api/items/${shared.id}/ideas`, { title: "G", priceCents: 100 })).ideas[0]!;
    await star(shared.id, idea.id);
    const hers = await post<ItemDetail>("/api/items", { name: "Hers" }, LENA);
    const secret = await post<ItemDetail>("/api/items", { name: "Secret", forMe: true });
    const before = await listIdeas();
    const attempts = [
      patchIdea(idea.id, { itemId: null }, LENA),
      patchIdea(idea.id, { itemId: hers.id }, LENA),
      patchIdea(idea.id, { itemId: secret.id }, LENA),
      api(`/api/ideas/${idea.id}/to-item`, { method: "POST", body: {}, as: LENA }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: "not_creator" });
    }
    expect(await listIdeas()).toEqual(before);
    expect(await getItem(shared.id)).toMatchObject({ status: "decided", ideas: [{ id: idea.id, isFavorite: true }] });
    expect((await json<ItemSummary[]>(await api("/api/items", { as: LENA }))).map((i) => i.name)).toEqual(["Shared", "Hers"]);
    // Re-sending the current itemId isn't a move, and field edits stay open to anyone who can edit the item.
    const d = await json<ItemDetail>(await patchIdea(idea.id, { title: "G2", itemId: shared.id }, LENA));
    expect(d.ideas[0]).toMatchObject({ title: "G2", isFavorite: true });
  });

  it("a field edit doesn't touch item_id or the star", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    // Star after the idea row was created; a PATCH of the price must not write back a stale is_favorite.
    await star(a.id, idea.id);
    const d = await json<ItemDetail>(await patchIdea(idea.id, { priceCents: 200 }));
    expect(d).toMatchObject({ status: "decided", ideas: [{ isFavorite: true, priceCents: 200, title: "I" }] });
  });

  it("DELETE of a linked favorite returns the item with the status reverted", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    await star(a.id, idea.id);
    const d = await json<ItemDetail>(await api(`/api/ideas/${idea.id}`, { method: "DELETE" }));
    expect(d).toMatchObject({ id: a.id, status: "needed", ideaCount: 0, ideas: [] });
  });
});

describe("POST /api/ideas/:id/to-item", () => {
  it("cuts the item name at 120 characters", async () => {
    const free = await createIdea({ title: "x".repeat(150) });
    const d = await json<ItemDetail>(await api(`/api/ideas/${free.id}/to-item`, { method: "POST", body: {} }), 201);
    expect(d.name).toBe("x".repeat(120));
    expect(d.ideas[0]!.title).toBe("x".repeat(150));
  });

  it("creates a shared item named after the idea and links it without starring", async () => {
    const free = await createIdea({ title: "Green armchair", priceCents: 25000 });
    const d = await json<ItemDetail>(await api(`/api/ideas/${free.id}/to-item`, { method: "POST", body: {} }), 201);
    expect(d).toMatchObject({
      name: "Green armchair", roomId: null, forPersonId: null, visibleToAll: false, status: "needed", ideaCount: 1,
      price: { kind: "range", minCents: 25000, maxCents: 25000 }, canEdit: true,
    });
    expect(d.ideas).toMatchObject([{ id: free.id, isFavorite: false }]);
    expect((await listIdeas(LENA)).map((i) => i.id)).toEqual([free.id]);
  });

  it("in my own room it defaults to just me; in a shared room to everyone", async () => {
    const mine = await post<Room>("/api/rooms", { name: "Gideon's room", personId: gideonId });
    const free = await createIdea({ title: "Desk" });
    const d = await json<ItemDetail>(await api(`/api/ideas/${free.id}/to-item`, { method: "POST", body: { roomId: mine.id } }), 201);
    expect(d).toMatchObject({ roomId: mine.id, forPersonId: gideonId, visibleToAll: false, payer: { kind: "person", personId: gideonId } });
    expect(await listIdeas(LENA)).toEqual([]);

    const hers = await post<Room>("/api/rooms", { name: "Lena's room", personId: lenaId });
    const other = await createIdea({ title: "Rug" });
    const e = await json<ItemDetail>(await api(`/api/ideas/${other.id}/to-item`, { method: "POST", body: { roomId: hers.id } }), 201);
    expect(e).toMatchObject({ roomId: hers.id, forPersonId: null });
  });

  it("rejects an unknown room with 400 and keeps the idea unlinked", async () => {
    const free = await createIdea({ title: "Desk" });
    const res = await api(`/api/ideas/${free.id}/to-item`, { method: "POST", body: { roomId: 99999 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_room" });
    expect((await listIdeas())[0]!.itemId).toBeNull();
    expect(await json<ItemSummary[]>(await api("/api/items"))).toEqual([]);
  });

  it("moving a linked favorite to a new item reverts the old item", async () => {
    const a = await post<ItemDetail>("/api/items", { name: "A" });
    const idea = (await post<ItemDetail>(`/api/items/${a.id}/ideas`, { title: "I", priceCents: 100 })).ideas[0]!;
    await star(a.id, idea.id);
    const d = await json<ItemDetail>(await api(`/api/ideas/${idea.id}/to-item`, { method: "POST", body: {} }), 201);
    expect(d).toMatchObject({ name: "I", status: "needed", ideas: [{ id: idea.id, isFavorite: false }] });
    expect(await getItem(a.id)).toMatchObject({ status: "needed", ideaCount: 0 });
  });
});
