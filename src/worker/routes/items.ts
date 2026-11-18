import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { fail } from "../http";
import { defaultPricePaid } from "../../shared/pricing";
import {
  assertCanEdit,
  getIdeaRows,
  getItemDetail,
  getVisibleItemRow,
  listVisibleItems,
  pricingInput,
  type ItemRow,
} from "../items-query";

const name = z.string().trim().min(1).max(120);
const roomId = z.number().int().positive().nullable();
const cents = z.number().int().min(0).nullable();
const payer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("together") }),
  z.object({ kind: z.literal("person"), personId: z.number().int().positive() }),
]);

const createBody = z.object({
  name,
  roomId: roomId.optional(),
  forMe: z.boolean().optional(),
  ownPriceCents: cents.optional(),
});

const patchBody = z.object({
  name: name.optional(),
  roomId: roomId.optional(),
  forMe: z.boolean().optional(),
  visibleToAll: z.boolean().optional(),
  status: z.enum(["needed", "decided", "bought", "owned"]).optional(),
  payer: payer.optional(),
  quantity: z.number().int().min(1).optional(),
  ownPriceCents: cents.optional(),
  pricePaidCents: cents.optional(),
  notes: z.string().max(2000).optional(),
});

/** Path ids must be positive integers; anything else is a 404, never a 500. */
function pathId(c: Context<AppEnv>): number {
  const raw = c.req.param("id") ?? "";
  if (!/^[1-9]\d{0,15}$/.test(raw)) fail(404, "not_found", "Item not found");
  return Number(raw);
}

/** Parses the JSON body. Done inside handlers (not as middleware) so visibility checks run first. */
async function parseBody<T extends z.ZodType>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    fail(400, "invalid_body", "Request body must be JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) fail(400, "invalid_body", z.prettifyError(result.error));
  return result.data;
}

async function roomOwner(db: D1Database, id: number): Promise<{ person_id: number | null }> {
  const room = await db.prepare("SELECT person_id FROM rooms WHERE id = ?").bind(id).first<{ person_id: number | null }>();
  if (!room) fail(400, "invalid_room", "That room does not exist");
  return room;
}

const items = new Hono<AppEnv>();

items.get("/items", async (c) => c.json(await listVisibleItems(c.env.DB, c.var.me.id)));

items.post("/items", async (c) => {
  const body = await parseBody(c, createBody);
  const meId = c.var.me.id;
  const room = body.roomId == null ? null : await roomOwner(c.env.DB, body.roomId);
  const forMe = body.forMe ?? (room !== null && room.person_id === meId);
  const created = await c.env.DB.prepare(
    `INSERT INTO items (name, room_id, for_person_id, visible_to_all, payer_person_id, own_price_cents, created_by)
     VALUES (?, ?, ?, 0, ?, ?, ?) RETURNING id`,
  )
    .bind(body.name, body.roomId ?? null, forMe ? meId : null, forMe ? meId : null, body.ownPriceCents ?? null, meId)
    .first<{ id: number }>();
  return c.json(await getItemDetail(c.env.DB, created!.id, meId), 201);
});

items.get("/items/:id", async (c) => c.json(await getItemDetail(c.env.DB, pathId(c), c.var.me.id)));

items.patch("/items/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const row = await getVisibleItemRow(db, pathId(c), meId);
  assertCanEdit(row, meId);
  const body = await parseBody(c, patchBody);
  const next: ItemRow = { ...row };

  if (body.name !== undefined) next.name = body.name;
  if (body.roomId !== undefined) {
    if (body.roomId !== null) await roomOwner(db, body.roomId);
    next.room_id = body.roomId;
  }
  if (body.forMe === true && row.for_person_id === null) {
    // Switched from Everyone to Just me: stays visible so it doesn't vanish for the others.
    next.for_person_id = meId;
    next.visible_to_all = 1;
    next.payer_person_id = meId;
    next.paid_together = 0;
  } else if (body.forMe === false) {
    next.for_person_id = null;
    next.visible_to_all = 0;
  }
  if (body.visibleToAll !== undefined) {
    if (next.for_person_id === null) fail(400, "shared_item", "Shared items are always visible to everyone");
    next.visible_to_all = body.visibleToAll ? 1 : 0;
  }
  if (body.payer !== undefined) {
    if (next.for_person_id !== null) fail(400, "personal_item", "A personal item's payer is always its owner");
    if (body.payer.kind === "person") {
      const person = await db.prepare("SELECT id FROM people WHERE id = ?").bind(body.payer.personId).first();
      if (!person) fail(400, "invalid_payer", "That person does not exist");
    }
    next.payer_person_id = body.payer.kind === "person" ? body.payer.personId : null;
    next.paid_together = body.payer.kind === "together" ? 1 : 0;
  }
  if (body.quantity !== undefined) next.quantity = body.quantity;
  if (body.ownPriceCents !== undefined) next.own_price_cents = body.ownPriceCents;
  if (body.pricePaidCents !== undefined) next.price_paid_cents = body.pricePaidCents;
  if (body.notes !== undefined) next.notes = body.notes;
  if (body.status !== undefined) {
    next.status = body.status;
    if (body.status === "bought" && next.price_paid_cents === null && body.pricePaidCents === undefined) {
      next.price_paid_cents = defaultPricePaid(pricingInput(next, await getIdeaRows(db, row.id)));
    }
  }

  await db
    .prepare(
      `UPDATE items SET name = ?, room_id = ?, for_person_id = ?, visible_to_all = ?, status = ?,
         payer_person_id = ?, paid_together = ?, quantity = ?, own_price_cents = ?, price_paid_cents = ?,
         notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      next.name,
      next.room_id,
      next.for_person_id,
      next.visible_to_all,
      next.status,
      next.payer_person_id,
      next.paid_together,
      next.quantity,
      next.own_price_cents,
      next.price_paid_cents,
      next.notes,
      row.id,
    )
    .run();
  return c.json(await getItemDetail(db, row.id, meId));
});

items.delete("/items/:id", async (c) => {
  const db = c.env.DB;
  const meId = c.var.me.id;
  const row = await getVisibleItemRow(db, pathId(c), meId);
  assertCanEdit(row, meId);
  await db.batch([
    db.prepare("DELETE FROM ideas WHERE item_id = ?").bind(row.id),
    db.prepare("DELETE FROM items WHERE id = ?").bind(row.id),
  ]);
  return c.body(null, 204);
});

export default items;
