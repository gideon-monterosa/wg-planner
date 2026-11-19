import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Applies the migrations up to 0002 to an empty database, adds v1 data, then applies 0003.
describe("migration 0003_unlinked_ideas", () => {
  it("keeps existing linked ideas and favorites, and allows unlinked ideas afterwards", async () => {
    const db = env.MIGRATION_DB;
    const before = env.TEST_MIGRATIONS.filter((m) => m.name < "0003");
    expect(before.length).toBeGreaterThan(0);
    await applyD1Migrations(db, before);

    await db.batch([
      db.prepare("INSERT INTO people (id, name, email, sort) VALUES (1, 'Gideon', 'gideon@example.com', 1)"),
      db.prepare("INSERT INTO items (id, name, status, created_by) VALUES (1, 'Sofa', 'decided', 1), (2, 'Lamp', 'needed', 1)"),
      db.prepare(
        `INSERT INTO ideas (id, item_id, title, url, shop, price_cents, image_url, notes, is_favorite, created_by, created_at, updated_at)
         VALUES (1, 1, 'A', 'https://a.de/x', 'a.de', 74900, 'https://a.de/i.png', 'n1', 1, 1, '2026-01-01 10:00:00', '2026-01-02 10:00:00'),
                (2, 1, 'B', '', '', NULL, '', '', 0, 1, '2026-01-03 10:00:00', '2026-01-03 10:00:00'),
                (3, 2, 'C', '', 'shop', 100, '', '', 0, 1, '2026-01-04 10:00:00', '2026-01-04 10:00:00')`,
      ),
    ]);
    const snapshot = await db.prepare("SELECT * FROM ideas ORDER BY id").all();

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    const after = await db.prepare("SELECT * FROM ideas ORDER BY id").all();
    expect(after.results).toEqual(snapshot.results);

    // item_id is nullable now, but an unlinked idea can't be a favorite.
    await db.prepare("INSERT INTO ideas (item_id, title, created_by) VALUES (NULL, 'free', 1)").run();
    await expect(
      db.prepare("INSERT INTO ideas (item_id, title, is_favorite, created_by) VALUES (NULL, 'x', 1, 1)").run(),
    ).rejects.toThrow(/CHECK/);
    // The one-favorite index survived, and the cascade still works.
    await expect(db.prepare("INSERT INTO ideas (item_id, title, is_favorite, created_by) VALUES (1, 'x', 1, 1)").run()).rejects.toThrow(
      /UNIQUE/,
    );
    await db.prepare("DELETE FROM items WHERE id = 2").run();
    const left = await db.prepare("SELECT id FROM ideas ORDER BY id").all<{ id: number }>();
    expect(left.results.map((r) => r.id)).toEqual([1, 2, 4]);

    const indexes = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ideas' AND sql IS NOT NULL ORDER BY name")
      .all<{ name: string }>();
    expect(indexes.results.map((r) => r.name)).toEqual(["ideas_item_id", "ideas_one_favorite"]);
  });
});
