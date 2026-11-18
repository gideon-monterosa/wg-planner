CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  for_person_id INTEGER REFERENCES people(id),
  visible_to_all INTEGER NOT NULL DEFAULT 0 CHECK (visible_to_all IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'decided', 'bought', 'owned')),
  payer_person_id INTEGER REFERENCES people(id),
  paid_together INTEGER NOT NULL DEFAULT 0 CHECK (paid_together IN (0, 1)),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  own_price_cents INTEGER CHECK (own_price_cents IS NULL OR own_price_cents >= 0),
  price_paid_cents INTEGER CHECK (price_paid_cents IS NULL OR price_paid_cents >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (NOT (paid_together = 1 AND payer_person_id IS NOT NULL))
);

CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_by INTEGER NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX ideas_one_favorite ON ideas(item_id) WHERE is_favorite = 1;
