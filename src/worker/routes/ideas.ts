import { Hono } from "hono";
import { z } from "zod";
import type { IdeaWithItem, Status } from "../../shared/types";
import type { AppEnv } from "../env";
import { fail } from "../http";
import {
  IDEAS_FROM,
  VISIBLE_IDEA,
  assertCanEdit,
  getItemDetail,
  getVisibleItemRow,
  insertItemStatement,
  type ItemRow,
} from "../items-query";
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
/** null unlinks; a number links (or moves) to that item. */
const itemId = z.number().int().positive().nullable();

const createBody = z.object({
  title,
  url: url.optional(),
  shop: shop.optional(),
  priceCents: cents.optional(),
  imageUrl: imageUrl.optional(),
  notes: notes.optional(),
});
/** `POST /api/ideas`: the title may be left out (or blank) when a url is given. */
const createFreeBody = createBody.extend({
  title: z.string().trim().max(200).optional(),
  itemId: itemId.optional(),
});
const patchBody = z.object({
  title: title.optional(),
  url: url.optional(),
  shop: shop.optional(),
  priceCents: cents.optional(),
  imageUrl: imageUrl.optional(),
  notes: notes.optional(),
  itemId: itemId.optional(),
});
const toItemBody = z.object({ roomId: z.number().int().positive().nullable().optional() });
const favoriteBody = z.object({ ideaId: z.number().int().positive().nullable() });

interface IdeaDbRow {
  id: number;
  item_id: number | null;
  title: string;
  url: string;
  shop: string;
  price_cents: number | null;
  image_url: string;
  notes: string;
  is_favorite: number;
  created_by: number;
  item_name: string | null;
  room_id: number | null;
  item_status: Status | null;
  item_for_person_id: number | null;
  item_visible_to_all: number | null;
}

const IDEA_SELECT = `SELECT d.id, d.item_id, d.title, d.url, d.shop, d.price_cents, d.image_url, d.notes, d.is_favorite,
  d.created_by, i.name AS item_name, i.room_id, i.status AS item_status, i.for_person_id AS item_for_person_id,
  i.visible_to_all AS item_visible_to_all
  FROM ${IDEAS_FROM}`;

function canEditItemOf(row: IdeaDbRow, meId: number): boolean {
  return row.item_id !== null && (row.item_for_person_id === null || row.item_for_person_id === meId);
}

function toIdeaWithItem(row: IdeaDbRow, meId: number): IdeaWithItem {
  const linked = row.item_id !== null;
  const canEditItem = canEditItemOf(row, meId);
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    url: row.url,
    shop: row.shop,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    notes: row.notes,
    isFavorite: row.is_favorite === 1,
    itemName: row.item_name,
    roomId: linked ? row.room_id : null,
    itemStatus: row.item_status,
    itemForPersonId: row.item_for_person_id,
    itemVisibleToAll: linked ? row.item_visible_to_all === 1 : null,
    // Unlinked: only its creator may edit it, and only its creator can see it.
    canEdit: linked ? canEditItem : row.created_by === meId,
    canEditItem,
    isMine: row.created_by === meId,
  };
}

/** The idea if the viewer may see it (VISIBLE_IDEA), else null. */
async function findVisibleIdea(db: D1Database, ideaId: number, meId: number): Promise<IdeaDbRow | null> {
  return db.prepare(`${IDEA_SELECT} WHERE d.id = ? AND ${VISIBLE_IDEA}`).bind(ideaId, meId, meId).first<IdeaDbRow>();
}

/**
 * Loads an idea the viewer may edit: an invisible idea (someone's unlinked idea, or one on a hidden item) is the
 * same 404 as a missing one, so ids cannot be probed; a linked idea then needs edit rights on its item (403).
 */
async function loadEditableIdea(db: D1Database, ideaId: number, meId: number): Promise<IdeaDbRow> {
  const idea = await findVisibleIdea(db, ideaId, meId);
  if (!idea) fail(404, "not_found", "Idea not found");
  if (idea.item_id !== null) assertCanEdit({ for_person_id: idea.item_for_person_id }, meId);
  return idea;
}

/** An item an idea is being linked or moved to: must be visible (404) and editable (403). */
async function loadLinkTarget(db: D1Database, id: number, meId: number): Promise<ItemRow> {
  const item = await getVisibleItemRow(db, id, meId);
  assertCanEdit(item, meId);
  return item;
}

/** Linking, moving, unlinking and to-item are for the idea's creator only (checked after the 404). */
function assertCreator(idea: IdeaDbRow, meId: number): void {
  if (idea.created_by !== meId) fail(403, "not_creator", "Only the person who added this idea can move it");
}

/**
 * The same rule as unstarring: the item goes back from decided to needed, unless it still has a favorite
 * (guards against a concurrent star landing between our read and this write).
 */
function revertDecided(db: D1Database, itemId: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE items SET status = 'needed', updated_at = datetime('now')
       WHERE id = ? AND status = 'decided'
         AND NOT EXISTS (SELECT 1 FROM ideas WHERE item_id = items.id AND is_favorite = 1)`,
    )
    .bind(itemId);
}

/** Linked ideas answer with their item (what the item modal shows); unlinked ones with the idea itself. */
async function ideaResponse(db: D1Database, ideaId: number, meId: number) {
  const row = await findVisibleIdea(db, ideaId, meId);
  if (!row) fail(404, "not_found", "Idea not found");
  return row.item_id !== null ? getItemDetail(db, row.item_id, meId) : toIdeaWithItem(row, meId);
}

const ideas = new Hono<AppEnv>();

ideas.get("/ideas", async (c) => {
  const meId = c.var.me.id;
  const { results } = await c.env.DB.prepare(`${IDEA_SELECT} WHERE ${VISIBLE_IDEA} ORDER BY d.id`)
    .bind(meId, meId)
    .all<IdeaDbRow>();
  return c.json(results.map((row) => toIdeaWithItem(row, meId)));
});

ideas.post("/ideas", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const body = await parseBody(c, createFreeBody);
  const link = body.url ?? "";
  const shopName = body.shop ?? shopFromUrl(link);
  const name = (body.title || shopName || shopFromUrl(link)).slice(0, 200);
  if (name === "") fail(400, "invalid_body", "Give a title or a link");
  if (body.itemId != null) await loadLinkTarget(db, body.itemId, meId);
  const created = await db
    .prepare(
      `INSERT INTO ideas (item_id, title, url, shop, price_cents, image_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(body.itemId ?? null, name, link, shopName, body.priceCents ?? null, body.imageUrl ?? "", body.notes ?? "", meId)
    .first<{ id: number }>();
  const row = await findVisibleIdea(db, created!.id, meId);
  return c.json(toIdeaWithItem(row!, meId), 201);
});

ideas.post("/items/:id/ideas", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const item = await loadLinkTarget(db, pathId(c), meId);
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

/**
 * Edits an idea; `itemId` links, moves or unlinks it (edit rights on the idea now and on the target item).
 * Moving or unlinking the favorite clears the star and reverts the old item, in the same batch.
 */
ideas.patch("/ideas/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const idea = await loadEditableIdea(db, pathId(c, "Idea"), meId);
  const body = await parseBody(c, patchBody);
  const moving = body.itemId !== undefined && body.itemId !== idea.item_id;
  if (moving) assertCreator(idea, meId);
  if (moving && body.itemId !== null) await loadLinkTarget(db, body.itemId!, meId);
  // Only the fields sent are written, so a concurrent edit of another field isn't overwritten.
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (moving) {
    set("item_id", body.itemId);
    // Moving or unlinking clears the star; read at write time, not from the row loaded above.
    sets.push("is_favorite = 0");
  }
  if (body.title !== undefined) set("title", body.title);
  if (body.url !== undefined) set("url", body.url);
  if (body.shop !== undefined) set("shop", body.shop);
  else if (body.url !== undefined) set("shop", shopFromUrl(body.url));
  if (body.priceCents !== undefined) set("price_cents", body.priceCents);
  if (body.imageUrl !== undefined) set("image_url", body.imageUrl);
  if (body.notes !== undefined) set("notes", body.notes);
  if (sets.length > 0) {
    const statements = [
      db
        .prepare(`UPDATE ideas SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...values, idea.id),
    ];
    // The revert itself is guarded: it only applies when the old item has no favorite left after the move.
    if (moving && idea.item_id !== null && idea.is_favorite === 1) statements.push(revertDecided(db, idea.item_id));
    await db.batch(statements);
  }
  return c.json(await ideaResponse(db, idea.id, meId));
});

/** Linked: answers with the item. Unlinked: 204. */
ideas.delete("/ideas/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const idea = await loadEditableIdea(db, pathId(c, "Idea"), meId);
  const statements = [db.prepare("DELETE FROM ideas WHERE id = ?").bind(idea.id)];
  if (idea.is_favorite === 1) statements.push(revertDecided(db, idea.item_id!));
  await db.batch(statements);
  if (idea.item_id === null) return c.body(null, 204);
  return c.json(await getItemDetail(db, idea.item_id, meId));
});

/** Creates an item named after the idea (quick-add defaults) and links the idea to it, unstarred. */
ideas.post("/ideas/:id/to-item", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const idea = await loadEditableIdea(db, pathId(c, "Idea"), meId);
  assertCreator(idea, meId);
  const body = await parseBody(c, toItemBody);
  const insert = await insertItemStatement(db, { name: idea.title.slice(0, 120).trim(), roomId: body.roomId }, meId);
  const statements = [
    insert,
    // Same transaction, so last_insert_rowid() is the item inserted just above.
    db
      .prepare("UPDATE ideas SET item_id = last_insert_rowid(), is_favorite = 0, updated_at = datetime('now') WHERE id = ?")
      .bind(idea.id),
  ];
  if (idea.is_favorite === 1) statements.push(revertDecided(db, idea.item_id!));
  const [created, linked] = await db.batch<{ id: number }>(statements);
  const newItemId = created!.results[0]!.id;
  if (linked!.meta.changes !== 1) {
    // The idea vanished between the load and the batch: drop the orphan item.
    await db.prepare("DELETE FROM items WHERE id = ?").bind(newItemId).run();
    fail(404, "not_found", "Idea not found");
  }
  return c.json(await getItemDetail(db, newItemId, meId), 201);
});

ideas.put("/items/:id/favorite", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const item = await loadLinkTarget(db, pathId(c), meId);
  const { ideaId } = await parseBody(c, favoriteBody);
  const clear = db.prepare("UPDATE ideas SET is_favorite = 0 WHERE item_id = ? AND is_favorite = 1").bind(item.id);
  if (ideaId === null) {
    await db.batch([clear, revertDecided(db, item.id)]);
  } else {
    // Unlinked ideas (item_id NULL) never match, so they can't be starred.
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
