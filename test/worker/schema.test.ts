import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./helpers";

// Runs first, before any resetDb(): checks the rows shipped by migrations only.
describe("default data", () => {
  it("ships the four default shared rooms", async () => {
    const { results } = await env.DB.prepare("SELECT name, person_id FROM rooms ORDER BY sort").all<{
      name: string;
      person_id: number | null;
    }>();
    expect(results.map((r) => r.name)).toEqual(["Kitchen", "Living room", "Bathroom", "Hallway"]);
    expect(results.every((r) => r.person_id === null)).toBe(true);
  });
});

describe("schema", () => {
  beforeEach(async () => {
    await resetDb();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO people (id, name, email, sort) VALUES (1, 'Gideon', 'gideon@example.com', 1)"),
      env.DB.prepare("INSERT INTO rooms (id, name, sort) VALUES (1, 'Kitchen', 1)"),
    ]);
  });

  const insertItem = (extra: Record<string, unknown> = {}, id = 1) => {
    const cols: Record<string, unknown> = { id, name: "Lamp", created_by: 1, ...extra };
    const keys = Object.keys(cols);
    return env.DB.prepare(
      `INSERT INTO items (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
      .bind(...Object.values(cols))
      .run();
  };
  const insertIdea = (id: number, fav: number) =>
    env.DB.prepare("INSERT INTO ideas (id, item_id, title, is_favorite, created_by) VALUES (?, 1, 'x', ?, 1)")
      .bind(id, fav)
      .run();

  it("deleting a room moves its items to no room", async () => {
    await insertItem({ room_id: 1 });
    await env.DB.prepare("DELETE FROM rooms WHERE id = 1").run();
    const row = await env.DB.prepare("SELECT room_id FROM items WHERE id = 1").first<{ room_id: number | null }>();
    expect(row!.room_id).toBeNull();
  });

  it("an item can have only one favorite idea", async () => {
    await insertItem();
    await insertIdea(1, 1);
    await expect(insertIdea(2, 1)).rejects.toThrow(/UNIQUE/);
    await insertIdea(3, 0);
  });

  it("rejects quantity 0 and payer + together at the same time", async () => {
    await expect(insertItem({ quantity: 0 })).rejects.toThrow(/CHECK/);
    await expect(insertItem({ payer_person_id: 1, paid_together: 1 })).rejects.toThrow(/CHECK/);
  });

  it("deleting an item deletes its ideas", async () => {
    await insertItem();
    await insertIdea(1, 0);
    await env.DB.prepare("DELETE FROM items WHERE id = 1").run();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ideas").first<{ n: number }>();
    expect(row!.n).toBe(0);
  });
});
