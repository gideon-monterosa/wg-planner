-- Ideas can exist without an item ("unlinked"). SQLite can't drop NOT NULL in place,
-- so the table is recreated with every row, id and timestamp preserved.
PRAGMA defer_foreign_keys = true;

CREATE TABLE ideas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_by INTEGER NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- An unlinked idea can't be an item's favorite.
  CHECK (item_id IS NOT NULL OR is_favorite = 0)
);

INSERT INTO ideas_new (id, item_id, title, url, shop, price_cents, image_url, notes, is_favorite, created_by, created_at, updated_at)
SELECT id, item_id, title, url, shop, price_cents, image_url, notes, is_favorite, created_by, created_at, updated_at FROM ideas;

-- Carry over the AUTOINCREMENT sequence so ids of deleted ideas aren't reused.
-- (DROP TABLE removes the old sequence row; RENAME moves this one to "ideas".)
UPDATE sqlite_sequence
SET seq = max(seq, (SELECT seq FROM sqlite_sequence WHERE name = 'ideas'))
WHERE name = 'ideas_new' AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'ideas');
INSERT INTO sqlite_sequence (name, seq)
SELECT 'ideas_new', seq FROM sqlite_sequence
WHERE name = 'ideas' AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'ideas_new');

DROP TABLE ideas;
ALTER TABLE ideas_new RENAME TO ideas;

CREATE UNIQUE INDEX ideas_one_favorite ON ideas(item_id) WHERE is_favorite = 1;
CREATE INDEX ideas_item_id ON ideas(item_id);
