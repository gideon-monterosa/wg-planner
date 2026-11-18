import { Hono } from "hono";
import { z } from "zod";
import type { Room } from "../../shared/types";
import type { AppEnv } from "../env";
import { fail } from "../http";
import { parseBody } from "../route-utils";

const name = z.string().trim().min(1).max(60);
const personId = z.number().int().positive().nullable();

const ROOM_SELECT = "SELECT id, name, person_id AS personId, sort FROM rooms";

const rooms = new Hono<AppEnv>();

async function listRooms(db: D1Database): Promise<Room[]> {
  const { results } = await db.prepare(`${ROOM_SELECT} ORDER BY sort, id`).all<Room>();
  return results;
}

async function requirePerson(db: D1Database, id: number | null | undefined) {
  if (id == null) return;
  const row = await db.prepare("SELECT 1 AS ok FROM people WHERE id = ?").bind(id).first();
  if (!row) fail(400, "invalid_person", "Unknown person");
}

function parseId(raw: string): number {
  if (!/^\d{1,15}$/.test(raw)) fail(404, "not_found", "Room not found");
  return Number(raw);
}

rooms.get("/rooms", async (c) => c.json(await listRooms(c.env.DB)));

const createBody = z.object({ name, personId });
const orderBody = z.object({ ids: z.array(z.number().int()) });
const patchBody = z.object({ name: name.optional(), personId: personId.optional() });

rooms.post("/rooms", async (c) => {
  const body = await parseBody(c, createBody);
  await requirePerson(c.env.DB, body.personId);
  const room = await c.env.DB.prepare(
    `INSERT INTO rooms (name, person_id, sort)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM rooms))
     RETURNING id, name, person_id AS personId, sort`,
  )
    .bind(body.name, body.personId)
    .first<Room>();
  return c.json(room, 201);
});

rooms.put(
  "/rooms/order",
  async (c) => {
    const { ids } = await parseBody(c, orderBody);
    const current = await listRooms(c.env.DB);
    const exact =
      ids.length === current.length &&
      new Set(ids).size === ids.length &&
      current.every((r) => ids.includes(r.id));
    if (!exact) fail(400, "invalid_order", "ids must list every room exactly once");
    await c.env.DB.batch(
      ids.map((id, i) => c.env.DB.prepare("UPDATE rooms SET sort = ? WHERE id = ?").bind(i, id)),
    );
    return c.json(await listRooms(c.env.DB));
  },
);

rooms.patch(
  "/rooms/:id",
  async (c) => {
    const id = parseId(c.req.param("id"));
    const body = await parseBody(c, patchBody);
    await requirePerson(c.env.DB, body.personId);
    const existing = await c.env.DB.prepare(`${ROOM_SELECT} WHERE id = ?`).bind(id).first<Room>();
    if (!existing) fail(404, "not_found", "Room not found");
    const next = {
      name: body.name ?? existing.name,
      personId: body.personId === undefined ? existing.personId : body.personId,
    };
    await c.env.DB.prepare("UPDATE rooms SET name = ?, person_id = ? WHERE id = ?")
      .bind(next.name, next.personId, id)
      .run();
    return c.json({ ...existing, ...next });
  },
);

rooms.delete("/rooms/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const res = await c.env.DB.prepare("DELETE FROM rooms WHERE id = ?").bind(id).run();
  if (!res.meta.changes) fail(404, "not_found", "Room not found");
  return c.body(null, 204);
});

export default rooms;
