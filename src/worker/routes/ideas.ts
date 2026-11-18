import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { fail } from "../http";
import { VISIBLE, assertCanEdit, getItemDetail, getVisibleItemRow } from "../items-query";
import { parseBody, pathId } from "../route-utils";

/** Hostname without `www.`, or "" when the URL is empty or invalid. */
export function shopFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const title = z.string().trim().min(1).max(200);
/** Empty, or an absolute http(s) URL: these end up in an href / img src, so no javascript: or data:. */
const webUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    if (v === "") return true;
    try {
      const { protocol } = new URL(v);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be an http(s) URL");
const url = webUrl;
const cents = z.number().int().min(0).nullable();
const imageUrl = webUrl;
const notes = z.string().max(2000);
const shop = z.string().trim().max(100);

const createBody = z.object({
  title,
  url: url.optional(),
  shop: shop.optional(),
  priceCents: cents.optional(),
  imageUrl: imageUrl.optional(),
  notes: notes.optional(),
});
const patchBody = z.object({
  title: title.optional(),
  url: url.optional(),
  shop: shop.optional(),
  priceCents: cents.optional(),
  imageUrl: imageUrl.optional(),
  notes: notes.optional(),
});
const favoriteBody = z.object({ ideaId: z.number().int().positive().nullable() });

interface IdeaDbRow {
  id: number;
  item_id: number;
  title: string;
  url: string;
  shop: string;
  price_cents: number | null;
  image_url: string;
  notes: string;
  is_favorite: number;
}

/**
 * Loads an idea and its item with the usual guards: an idea on a hidden item is the same 404 as a
 * missing idea (so ids of hidden items cannot be probed), then edit rights.
 */
async function loadEditableIdea(db: D1Database, ideaId: number, meId: number) {
  const idea = await db
    .prepare(`SELECT ideas.* FROM ideas JOIN items i ON i.id = ideas.item_id WHERE ideas.id = ? AND ${VISIBLE}`)
    .bind(ideaId, meId)
    .first<IdeaDbRow>();
  if (!idea) fail(404, "not_found", "Idea not found");
  const item = await getVisibleItemRow(db, idea.item_id, meId);
  assertCanEdit(item, meId);
  return { idea, item };
}

const ideas = new Hono<AppEnv>();

ideas.post("/items/:id/ideas", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const item = await getVisibleItemRow(db, pathId(c), meId);
  assertCanEdit(item, meId);
  const body = await parseBody(c, createBody);
  const link = body.url ?? "";
  await db
    .prepare(
      `INSERT INTO ideas (item_id, title, url, shop, price_cents, image_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(item.id, body.title, link, body.shop ?? shopFromUrl(link), body.priceCents ?? null, body.imageUrl ?? "", body.notes ?? "", meId)
    .run();
  return c.json(await getItemDetail(db, item.id, meId), 201);
});

ideas.patch("/ideas/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const { idea, item } = await loadEditableIdea(db, pathId(c, "Idea"), meId);
  const body = await parseBody(c, patchBody);
  const link = body.url ?? idea.url;
  await db
    .prepare(
      `UPDATE ideas SET title = ?, url = ?, shop = ?, price_cents = ?, image_url = ?, notes = ?,
         updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(
      body.title ?? idea.title,
      link,
      body.shop ?? (body.url !== undefined ? shopFromUrl(link) : idea.shop),
      body.priceCents !== undefined ? body.priceCents : idea.price_cents,
      body.imageUrl ?? idea.image_url,
      body.notes ?? idea.notes,
      idea.id,
    )
    .run();
  return c.json(await getItemDetail(db, item.id, meId));
});

ideas.delete("/ideas/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const { idea, item } = await loadEditableIdea(db, pathId(c, "Idea"), meId);
  const statements = [db.prepare("DELETE FROM ideas WHERE id = ?").bind(idea.id)];
  if (idea.is_favorite === 1) {
    statements.push(
      db.prepare("UPDATE items SET status = 'needed', updated_at = datetime('now') WHERE id = ? AND status = 'decided'").bind(item.id),
    );
  }
  await db.batch(statements);
  return c.json(await getItemDetail(db, item.id, meId));
});

ideas.put("/items/:id/favorite", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const item = await getVisibleItemRow(db, pathId(c), meId);
  assertCanEdit(item, meId);
  const { ideaId } = await parseBody(c, favoriteBody);
  const clear = db.prepare("UPDATE ideas SET is_favorite = 0 WHERE item_id = ? AND is_favorite = 1").bind(item.id);
  if (ideaId === null) {
    await db.batch([
      clear,
      db.prepare("UPDATE items SET status = 'needed', updated_at = datetime('now') WHERE id = ? AND status = 'decided'").bind(item.id),
    ]);
  } else {
    const idea = await db.prepare("SELECT id FROM ideas WHERE id = ? AND item_id = ?").bind(ideaId, item.id).first();
    if (!idea) fail(400, "idea_not_on_item", "That idea does not belong to this item");
    await db.batch([
      clear,
      db.prepare("UPDATE ideas SET is_favorite = 1 WHERE id = ?").bind(ideaId),
      db.prepare("UPDATE items SET status = 'decided', updated_at = datetime('now') WHERE id = ? AND status = 'needed'").bind(item.id),
    ]);
  }
  return c.json(await getItemDetail(db, item.id, meId));
});

export default ideas;
