import { beforeEach, describe, it, expect } from "vitest";
import type { ItemDetail, Person } from "../../src/shared/types";
import { shopFromUrl } from "../../src/worker/routes/ideas";
import { api, post, resetDb } from "./helpers";

const LENA = "lena@example.com";
let itemId: number;
let ideaA: number;
let ideaB: number;

async function put(id: number, ideaId: number | null, as?: string) {
  return api(`/api/items/${id}/favorite`, { method: "PUT", body: { ideaId }, as });
}
async function star(id: number, ideaId: number | null): Promise<ItemDetail> {
  const res = await put(id, ideaId);
  expect(res.status).toBe(200);
  return (await res.json()) as ItemDetail;
}
async function setStatus(id: number, s: string) {
  expect((await api(`/api/items/${id}`, { method: "PATCH", body: { status: s } })).status).toBe(200);
}

beforeEach(async () => {
  await resetDb();
  await api("/api/me");
  await post<Person>("/api/people", { name: "Lena", email: LENA });
  itemId = (await post<ItemDetail>("/api/items", { name: "Sofa", ownPriceCents: 50000 })).id;
  let d = await post<ItemDetail>(`/api/items/${itemId}/ideas`, { title: "A", url: "https://www.shop-a.de/x", priceCents: 74900 });
  ideaA = d.ideas[0]!.id;
  d = await post<ItemDetail>(`/api/items/${itemId}/ideas`, { title: "B", priceCents: 119000 });
  ideaB = d.ideas[1]!.id;
});

describe("ideas", () => {
  it("adds an idea with derived shop", async () => {
    const d = (await (await api(`/api/items/${itemId}`)).json()) as ItemDetail;
    expect(d.ideas[0]).toMatchObject({ title: "A", shop: "shop-a.de", priceCents: 74900, isFavorite: false });
    expect(d.ideaCount).toBe(2);
  });

  it("recomputes shop when url changes", async () => {
    const res = await api(`/api/ideas/${ideaA}`, { method: "PATCH", body: { url: "https://www.other.com/y" } });
    expect(((await res.json()) as ItemDetail).ideas[0]!.shop).toBe("other.com");
    const res2 = await api(`/api/ideas/${ideaA}`, { method: "PATCH", body: { title: "A2" } });
    expect(((await res2.json()) as ItemDetail).ideas[0]).toMatchObject({ title: "A2", shop: "other.com" });
  });

  it("rejects an invalid body with 400", async () => {
    const res = await api(`/api/items/${itemId}/ideas`, { method: "POST", body: { title: "" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_body" });
  });

  it("rejects non-http(s) url and imageUrl on create and patch", async () => {
    for (const bad of [{ url: "javascript:alert(1)" }, { imageUrl: "data:image/png;base64,AAAA" }, { url: "/relative" }]) {
      const c = await api(`/api/items/${itemId}/ideas`, { method: "POST", body: { title: "X", ...bad } });
      expect(c.status).toBe(400);
      expect(await c.json()).toMatchObject({ error: "invalid_body" });
      const p = await api(`/api/ideas/${ideaA}`, { method: "PATCH", body: bad });
      expect(p.status).toBe(400);
      expect(await p.json()).toMatchObject({ error: "invalid_body" });
    }
    const ok = await api(`/api/ideas/${ideaA}`, { method: "PATCH", body: { url: "", imageUrl: "https://a.de/i.png" } });
    expect(ok.status).toBe(200);
  });

  it("starring sets the item price and moves needed to decided", async () => {
    const d = await star(itemId, ideaA);
    expect(d).toMatchObject({ status: "decided", price: { kind: "favorite", cents: 74900 } });
  });

  it("switching the favorite keeps exactly one favorite", async () => {
    await star(itemId, ideaA);
    const d = await star(itemId, ideaB);
    expect(d.ideas.filter((i) => i.isFavorite)).toHaveLength(1);
    expect(d.ideas.find((i) => i.id === ideaB)!.isFavorite).toBe(true);
  });

  it("unstarring moves decided back to needed and falls back to own price", async () => {
    await star(itemId, ideaA);
    const d = await star(itemId, null);
    expect(d.status).toBe("needed");
    expect(d.price.kind).not.toBe("favorite");
    expect(d.ideas.some((i) => i.isFavorite)).toBe(false);
  });

  it("deleting the favorite idea reverts status and price", async () => {
    await star(itemId, ideaA);
    const res = await api(`/api/ideas/${ideaA}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const d = (await res.json()) as ItemDetail;
    expect(d.status).toBe("needed");
    expect(d.ideas).toHaveLength(1);
    expect(d.price.kind).not.toBe("favorite");
  });

  it("deleting a non-favorite idea keeps a decided status", async () => {
    await star(itemId, ideaA);
    const d = (await (await api(`/api/ideas/${ideaB}`, { method: "DELETE" })).json()) as ItemDetail;
    expect(d.status).toBe("decided");
  });

  it("favorite actions never change bought or owned", async () => {
    for (const s of ["bought", "owned"]) {
      await setStatus(itemId, s);
      expect((await star(itemId, ideaA)).status).toBe(s);
      expect((await star(itemId, null)).status).toBe(s);
      await star(itemId, ideaA);
      const d = (await (await api(`/api/ideas/${ideaA}`, { method: "DELETE" })).json()) as ItemDetail;
      expect(d.status).toBe(s);
      const r = await post<ItemDetail>(`/api/items/${itemId}/ideas`, { title: "A", priceCents: 74900 });
      ideaA = r.ideas.at(-1)!.id;
    }
  });

  it("rejects an idea from another item", async () => {
    const other = await post<ItemDetail>("/api/items", { name: "Lamp" });
    const res = await put(other.id, ideaA);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "idea_not_on_item" });
  });

  it("cannot touch ideas of someone else's hidden item", async () => {
    const mine = await post<ItemDetail>("/api/items", { name: "Secret", forMe: true });
    const d = await post<ItemDetail>(`/api/items/${mine.id}/ideas`, { title: "S" });
    const id = d.ideas[0]!.id;
    expect((await api(`/api/items/${mine.id}/ideas`, { method: "POST", body: { title: "x" }, as: LENA })).status).toBe(404);
    expect((await api(`/api/ideas/${id}`, { method: "PATCH", body: { title: "x" }, as: LENA })).status).toBe(404);
    expect((await api(`/api/ideas/${id}`, { method: "DELETE", as: LENA })).status).toBe(404);
    expect((await put(mine.id, id, LENA)).status).toBe(404);
  });

  it("is read-only for visible personal items of others", async () => {
    const mine = await post<ItemDetail>("/api/items", { name: "Shown", forMe: true });
    await api(`/api/items/${mine.id}`, { method: "PATCH", body: { visibleToAll: true } });
    const d = await post<ItemDetail>(`/api/items/${mine.id}/ideas`, { title: "S" });
    const res = await api(`/api/ideas/${d.ideas[0]!.id}`, { method: "DELETE", as: LENA });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "read_only" });
  });

  it("bad ids are 404", async () => {
    expect((await api("/api/ideas/abc", { method: "DELETE" })).status).toBe(404);
    expect((await api("/api/ideas/99999", { method: "DELETE" })).status).toBe(404);
  });
});

describe("shopFromUrl", () => {
  it("derives the shop from the link", () => {
    expect(shopFromUrl("https://www.example-shop.de/sofa?id=1")).toBe("example-shop.de");
    expect(shopFromUrl("not a url")).toBe("");
    expect(shopFromUrl("")).toBe("");
  });
});
