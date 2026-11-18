# WG Planner v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app where Gideon and the flatmates plan what the flat needs: items by room, product ideas with a starred favorite, who pays, and per-person totals. It's hosted free on Cloudflare behind an email login.

**Architecture:** One Cloudflare Worker serves a React SPA (Workers Static Assets with SPA fallback) and a Hono JSON API under `/api/*`. All data lives in one D1 database. Cloudflare Access sits in front of the whole hostname, and the Worker identifies the person from the Access JWT. Pricing and visibility rules live server-side in small pure modules, so privacy can't leak through the UI.

**Tech Stack:** TypeScript, React 19, Vite with `@cloudflare/vite-plugin` (set up by `cf init .`), Tailwind CSS v4, wouter (routing), TanStack Query v5, Hono 4, zod + `@hono/zod-validator`, jose (JWT), D1, Vitest with `@cloudflare/vitest-plugin` for Worker tests and jsdom for web tests. Tools are pinned with mise.

**Spec:** `docs/superpowers/specs/2026-11-18-wg-planner-design.md`. Section numbers like "spec 6.11" refer to it. Read it before starting; this plan argues from it.

## Global Constraints

- No recurring cost: Workers Free, D1 Free, Zero Trust Free only (spec 3).
- Every tool comes from `mise.toml`: `node = "24"`, `"npm:cf" = "0.15.0"`. Never `npm install --global` (spec 3, 7.6).
- Use the `cf` CLI, not Wrangler. Wrangler is not a dependency. Only commands `cf` lacks (live logs) run as `npx wrangler …` (spec 7.6).
- Money is integer cents, euros only (spec 3, 7.2).
- Phone first: every screen must work at 375 px width (spec 3).
- UI copy is English, matching the mockups.
- An own price displays as `≈ €19`. Totals never show `≈` (spec 5.1).
- Personal items are hidden from others unless "Show to everyone" is on. The server enforces this on every endpoint, including totals (spec 5.2, 6.11).
- No cost splitting or settle-up logic anywhere (spec 2).
- The payer is one of: a person, "together", or not set (spec 6.17).
- Status values are exactly `needed`, `decided`, `bought`, `owned` (spec 6.1).
- Commit after every task, with Conventional Commit messages.

## Review Focus

1. **Typed prices in German format.** "19,99", "€ 19,5", "1.190" and "1,190" must parse to the cents a German user means, and garbage must be rejected rather than saved as 0. Pinned by `parseEuroInput` tests in Task 9.
2. **Hidden items leaking indirectly.** Opening someone's hidden item by URL, adding an idea to it, starring its idea, or reading the overview must behave as if the item doesn't exist (404). A 403 would reveal that it exists. Pinned in Tasks 6, 7 and 8.
3. **Email case mismatch at login.** Access may send `Gideon@Example.com` while the people table stores `gideon@example.com`, and that must still match. Pinned in Task 4.
4. **Starring the wrong idea, or two favorites at once.** An `ideaId` from a different item is rejected (400), and the database never holds two favorites for one item. Pinned in Tasks 2 and 7.
5. **Deleting things items depend on.** Deleting a room moves its items to "No room" and never deletes them. Deleting the favorite idea reverts the price and moves `decided` back to `needed`. Pinned in Tasks 5 and 7.

---

## File structure

```
mise.toml                      tools + tasks
package.json
cloudflare.config.ts           Worker, assets, D1 binding, vars (created by `cf init .`, then edited)
vite.config.ts                 react + tailwind + cloudflare plugins
vitest.config.ts               web + shared unit tests (jsdom)
vitest.worker.config.ts        Worker/API tests in the Workers runtime
index.html
.dev.vars.example              DEV_USER_EMAIL for local dev (real .dev.vars is gitignored)
migrations/0001_init.sql       schema
migrations/0002_default_rooms.sql
src/shared/types.ts            API contract types (used by worker and web)
src/shared/pricing.ts          itemPrice / plannedCents / spentCents / defaultPricePaid
src/worker/index.ts            Worker entry: export default app
src/worker/app.ts              Hono app, error handler, mounts routes
src/worker/env.ts              Env + AppEnv types
src/worker/http.ts             fail() helper
src/worker/auth.ts             resolveEmail + identity middleware
src/worker/items-query.ts      listVisibleItems / getVisibleItemRow / getItemDetail / assertCanEdit
src/worker/overview.ts         computeOverview (pure)
src/worker/routes/people.ts
src/worker/routes/rooms.ts
src/worker/routes/items.ts
src/worker/routes/ideas.ts
src/worker/routes/overview.ts
src/web/main.tsx
src/web/App.tsx                routes + bottom nav
src/web/api.ts                 fetch wrapper + TanStack Query hooks
src/web/format.ts              formatEuro / formatPrice / parseEuroInput
src/web/grouping.ts            groupByRoom (pure)
src/web/styles.css             tailwind import + color tokens (light/dark)
src/web/components/PriceLabel.tsx
src/web/components/StatusPill.tsx
src/web/components/QuickAdd.tsx
src/web/components/PersonBars.tsx
src/web/pages/MovingList.tsx
src/web/pages/ItemPage.tsx
src/web/pages/Overview.tsx
src/web/pages/Rooms.tsx
src/web/pages/People.tsx
test/worker/apply-migrations.ts
test/worker/helpers.ts         api() request helper + resetDb()
test/worker/*.test.ts
test/shared/pricing.test.ts
test/web/*.test.ts(x)
```

---

### Task 1: Toolchain, scaffold and test harness

**Files:**
- Create: `mise.toml`, `.gitignore`, `.dev.vars.example`, `src/worker/index.ts`, `src/worker/app.ts`, `src/worker/env.ts`, `src/worker/http.ts`, `vitest.config.ts`, `vitest.worker.config.ts`, `test/worker/apply-migrations.ts`, `test/worker/helpers.ts`, `test/worker/health.test.ts`, `migrations/.gitkeep`
- Create (scaffolded): `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `cloudflare.config.ts`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/styles.css`

**Interfaces:**
- Produces:
  - `Env { DB: D1Database; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; DEV_USER_EMAIL?: string }`
  - `AppEnv { Bindings: Env; Variables: {} }`. Task 4 adds `me: Person`.
  - `app: Hono<AppEnv>` with base path `/api`, default-exported from `src/worker/app.ts`
  - `fail(status: 400 | 403 | 404 | 409 | 500, code: string, message?: string): never`, which throws an `HTTPException`. `app.onError` turns it into `{ error: code, message }` JSON.
  - Test helper `api(path: string, opts?: { as?: string; method?: string; body?: unknown }): Promise<Response>`, which calls `app.request(path, init, { ...env, DEV_USER_EMAIL: opts.as ?? "gideon@example.com" })`.
  - Test helper `post<T = any>(path: string, body: unknown, as?: string): Promise<T>`, which is `api(path, { method: "POST", body, as })` and returns the parsed JSON.
  - Test helper `resetDb(): Promise<void>`, which deletes all rows.

- [ ] **Step 1: Initialize the repo and mise**

```bash
git init
```
Write `mise.toml`:
```toml
[tools]
node = "24"
"npm:cf" = "0.15.0"

[tasks.dev]
description = "Run the app locally (Vite + Worker + local D1)"
run = "cf dev"

[tasks.test]
run = ["npx vitest run --config vitest.config.ts", "npx vitest run --config vitest.worker.config.ts"]

[tasks.typecheck]
run = ["cf workers types", "npx tsc -b"]

[tasks.deploy]
depends = ["test"]
run = "cf deploy"
```
Run `mise install`, then `cf --version`. Expected: `0.15.0`.

- [ ] **Step 2: Scaffold a Vite React-TS app in place, then let `cf` configure it**

The folder isn't empty (`docs/`, `.superpowers/`, `mise.toml`), so scaffold beside it and move the files in. Run `npm create vite@latest vite-tmp -- --template react-ts`, move everything from `vite-tmp/` (dotfiles included) into the project root, merging `.gitignore`, then delete `vite-tmp/`. Then run `npm install`, `npm i -D cf@0.15.0`, and `cf init .`. Expected: `cf init .` adds `@cloudflare/vite-plugin`, edits `vite.config.ts`, creates `cloudflare.config.ts` and adds a `deploy` script.
Move the Vite template's `src/*` into `src/web/` and point `index.html` at `/src/web/main.tsx`.
Install the app's dependencies:
- `npm i hono zod @hono/zod-validator jose wouter @tanstack/react-query`
- `npm i -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @cloudflare/vitest-plugin`

Add `tailwindcss()` to the Vite plugins, and make `src/web/styles.css` start with `@import "tailwindcss";`.

- [ ] **Step 3: Configure the Worker in `cloudflare.config.ts`**

Use function form. Set `name: "wg-planner"`, `entrypoint` imported from `./src/worker/index.ts` with `{ type: "cf-worker" }`, and keep the `compatibilityDate` that `cf init` wrote. Then add:
- Static assets with single-page-application fallback, with the Worker running first only for `/api/*`.
- `env.DB = bindings.d1({ name: "wg-planner" })`.
- In `mode === "production"` only: `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as `bindings.text("")`. They are filled in Task 14.

Look up the exact `assets` option names in the installed types (`node_modules/cf`, the `WorkerConfig` assets field). The spec equivalents are `not_found_handling = "single-page-application"` and `run_worker_first = ["/api/*"]`; don't guess the camelCase names.
Append `.cloudflare/`, `.dev.vars`, `.superpowers/` and `node_modules/` to `.gitignore`. Write `.dev.vars.example` containing `DEV_USER_EMAIL="gideon@example.com"`, and copy it to `.dev.vars`.

- [ ] **Step 4: Write the failing health test**

`vitest.worker.config.ts` uses `cloudflareTest()` from `@cloudflare/vitest-plugin`, following the docs' D1 recipe:
- `readD1Migrations(path.join(__dirname, "migrations"))`
- `miniflare: { d1Databases: ["DB"], bindings: { TEST_MIGRATIONS: migrations } }`
- `test.include: ["test/worker/**/*.test.ts"]`
- `setupFiles: ["./test/worker/apply-migrations.ts"]`, which calls `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` from `cloudflare:test`.

If the installed package exports these names differently, follow its README, but keep the `api()` and `resetDb()` helper signatures above.

```ts
// test/worker/health.test.ts
import { it, expect } from "vitest";
import { api } from "./helpers";

it("GET /api/health answers ok and reaches D1", async () => {
  const res = await api("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: 1 });
});

it("unknown API path is a JSON 404", async () => {
  const res = await api("/api/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: "not_found" });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run --config vitest.worker.config.ts`
Expected: FAIL (cannot resolve `src/worker/app` or a 404 on health).

- [ ] **Step 6: Implement `app`, `fail`, the health route and the Worker entry**

`GET /api/health` runs `SELECT 1 AS db` and returns `{ ok: true, db }`. `app.notFound` returns `{ error: "not_found" }` with status 404. `src/worker/index.ts` is `export default app`. `vitest.config.ts` sets `environment: "jsdom"` and `include: ["test/shared/**/*.test.ts", "test/web/**/*.test.{ts,tsx}"]`, with `passWithNoTests: true` for now.

- [ ] **Step 7: Run all tests and the dev server**

Run: `mise run test`
Expected: PASS (2 worker tests).
Run: `mise run dev` in the background (the `mo` skill can supervise it), then open the printed URL in the browser pane. Expected: the Vite React page loads, and `/api/health` returns `{"ok":true,"db":1}`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React app on Workers with cf, mise and test harness"
```

---

### Task 2: Database schema

**Files:**
- Create: `migrations/0001_init.sql`, `migrations/0002_default_rooms.sql`, `test/worker/schema.test.ts`
- Modify: `mise.toml` (add `db:migrate` tasks)

**Interfaces:**
- Produces these tables (column names are final; later tasks use them verbatim):
  - `people(id, name, email UNIQUE COLLATE NOCASE, sort)`
  - `rooms(id, name, person_id NULL → people ON DELETE SET NULL, sort)`
  - `items(id, name, room_id NULL → rooms ON DELETE SET NULL, for_person_id NULL → people, visible_to_all 0/1 DEFAULT 0, status CHECK IN ('needed','decided','bought','owned') DEFAULT 'needed', payer_person_id NULL → people, paid_together 0/1 DEFAULT 0, quantity INTEGER DEFAULT 1 CHECK (quantity >= 1), own_price_cents NULL CHECK (>= 0), price_paid_cents NULL CHECK (>= 0), notes TEXT DEFAULT '', created_by → people, created_at, updated_at, CHECK (NOT (paid_together = 1 AND payer_person_id IS NOT NULL)))`
  - `ideas(id, item_id → items ON DELETE CASCADE, title, url DEFAULT '', shop DEFAULT '', price_cents NULL CHECK (>= 0), image_url DEFAULT '', notes DEFAULT '', is_favorite 0/1 DEFAULT 0, created_by → people, created_at, updated_at)`
  - Index: `CREATE UNIQUE INDEX ideas_one_favorite ON ideas(item_id) WHERE is_favorite = 1`
- `0002_default_rooms.sql` inserts the shared rooms Kitchen, Living room, Bathroom, Hallway (sort 1–4).

- [ ] **Step 1: Write the failing schema tests**

```ts
// test/worker/schema.test.ts (beforeEach: resetDb(); insert person 1 and room 1)
it("deleting a room moves its items to no room", async () => {
  // insert item with room_id = 1, delete room 1
  expect(row.room_id).toBeNull();
});
it("an item can have only one favorite idea", async () => {
  // insert two ideas for item 1 with is_favorite = 1
  await expect(second).rejects.toThrow(/UNIQUE/);
});
it("rejects quantity 0 and payer + together at the same time", async () => {
  await expect(insertQty0).rejects.toThrow(/CHECK/);
  await expect(insertPayerAndTogether).rejects.toThrow(/CHECK/);
});
it("deleting an item deletes its ideas", async () => { /* count ideas = 0 */ });
it("ships the four default shared rooms", async () => {
  // after migrations only (no resetDb): names in sort order
  expect(names).toEqual(["Kitchen", "Living room", "Bathroom", "Hallway"]);
});
```
`resetDb()` deletes from `ideas`, `items`, `rooms` and `people`, in that order. The default-rooms test runs before any reset in its own file, or re-runs the 0002 insert.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/schema.test.ts`
Expected: FAIL (`no such table: items`).

- [ ] **Step 3: Write both migrations exactly as the Interfaces block specifies**

D1 enforces foreign keys by default. Timestamps use `DEFAULT (datetime('now'))`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run --config vitest.worker.config.ts`
Expected: PASS.

- [ ] **Step 5: Add migration tasks and apply them locally**

Check the argument form with `cf d1 migrations apply --help` (by binding `DB` or by name `wg-planner`). Then add `[tasks."db:migrate"]` (`… --local`) and `[tasks."db:migrate:remote"]` (`… --remote`) to `mise.toml`. Run `mise run db:migrate`, then `cf d1 raw <id-or-name> --sql "SELECT name FROM rooms" --local`. Expected: the four rooms.

- [ ] **Step 6: Commit**

```bash
git add migrations test/worker/schema.test.ts mise.toml
git commit -m "feat: add D1 schema and default rooms"
```

---

### Task 3: Shared pricing rules

**Files:**
- Create: `src/shared/types.ts`, `src/shared/pricing.ts`, `test/shared/pricing.test.ts`

**Interfaces:**
- Produces in `src/shared/types.ts` (the API contract; later tasks import these):
```ts
export type Status = "needed" | "decided" | "bought" | "owned";
export type Payer = { kind: "none" } | { kind: "together" } | { kind: "person"; personId: number };
export interface Person { id: number; name: string; email: string; sort: number }
export interface Room { id: number; name: string; personId: number | null; sort: number }
export type PriceInfo =
  | { kind: "paid" | "favorite" | "own"; cents: number }
  | { kind: "range"; minCents: number; maxCents: number }
  | { kind: "none" };
export interface ItemSummary {
  id: number; name: string; roomId: number | null; forPersonId: number | null;
  visibleToAll: boolean; status: Status; payer: Payer; quantity: number;
  ideaCount: number; price: PriceInfo; plannedCents: number; spentCents: number; canEdit: boolean;
}
export interface Idea {
  id: number; itemId: number; title: string; url: string; shop: string;
  priceCents: number | null; imageUrl: string; notes: string; isFavorite: boolean;
}
export interface ItemDetail extends ItemSummary {
  ownPriceCents: number | null; pricePaidCents: number | null; notes: string; ideas: Idea[];
}
export interface OverviewRow { key: string; label: string; ownCents: number; sharedCents: number }
export interface OverviewMode { me: { ownCents: number; sharedCents: number; totalCents: number }; rows: OverviewRow[] }
export interface Overview { planned: OverviewMode; spent: OverviewMode }
```
- Produces in `src/shared/pricing.ts`:
  - `PricingInput { status; quantity; ownPriceCents; pricePaidCents; ideas: { priceCents: number | null; isFavorite: boolean }[] }`
  - `itemPrice(i): PriceInfo`
  - `plannedCents(i): number`
  - `spentCents(i): number`
  - `defaultPricePaid(i): number | null`

- [ ] **Step 1: Write the failing tests**

```ts
const base = { status: "needed", quantity: 1, ownPriceCents: null, pricePaidCents: null, ideas: [] } as const;
it("owned items have no price", () => {
  expect(itemPrice({ ...base, status: "owned", ownPriceCents: 1900 })).toEqual({ kind: "none" });
  expect(plannedCents({ ...base, status: "owned", ownPriceCents: 1900 })).toBe(0);
});
it("bought with price paid wins", () =>
  expect(itemPrice({ ...base, status: "bought", pricePaidCents: 70000, ideas: [{ priceCents: 74900, isFavorite: true }] }))
    .toEqual({ kind: "paid", cents: 70000 }));
it("favorite beats own price and multiplies by quantity", () =>
  expect(itemPrice({ ...base, quantity: 4, ownPriceCents: 1000, ideas: [{ priceCents: 2500, isFavorite: true }] }))
    .toEqual({ kind: "favorite", cents: 10000 }));
it("own price when no favorite", () =>
  expect(itemPrice({ ...base, ownPriceCents: 1900 })).toEqual({ kind: "own", cents: 1900 }));
it("range when ideas but no favorite and no own price, not counted", () => {
  const i = { ...base, ideas: [{ priceCents: 26000, isFavorite: false }, { priceCents: 15000, isFavorite: false }] };
  expect(itemPrice(i)).toEqual({ kind: "range", minCents: 15000, maxCents: 26000 });
  expect(plannedCents(i)).toBe(0);
});
it("spent counts only bought items with a price paid", () => {
  expect(spentCents({ ...base, status: "bought", pricePaidCents: 389_00 })).toBe(38900);
  expect(spentCents({ ...base, status: "decided", ownPriceCents: 1900 })).toBe(0);
});
it("default price paid is the favorite or own unit price × quantity", () => {
  expect(defaultPricePaid({ ...base, quantity: 2, ownPriceCents: 500 })).toBe(1000);
  expect(defaultPricePaid(base)).toBeNull();
});
it("a favorite without a price falls through to the own price", () =>
  expect(itemPrice({ ...base, ownPriceCents: 900, ideas: [{ priceCents: null, isFavorite: true }] }))
    .toEqual({ kind: "own", cents: 900 }));
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.config.ts test/shared/pricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `pricing.ts`**

The order is from spec 6.3:
1. `owned` → `none`
2. `bought` with a price paid → `paid`
3. A favorite with a price → `favorite`
4. An own price → `own`
5. Priced ideas → `range` (min and max each × quantity)
6. Otherwise → `none`

`plannedCents` returns the cents for `paid`, `favorite` and `own`, and 0 otherwise.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run --config vitest.config.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared test/shared
git commit -m "feat: add shared API types and pricing rules"
```

---

### Task 4: Identity and people API

**Files:**
- Create: `src/worker/auth.ts`, `src/worker/routes/people.ts`, `test/worker/auth.test.ts`, `test/worker/people.test.ts`
- Modify: `src/worker/app.ts` (apply `identity` to everything except `/api/health`; mount people routes)

**Interfaces:**
- Consumes: `Env`, `AppEnv`, `fail`, `Person`.
- Produces:
  - `resolveEmail(req: Request, env: Env, getKey?: JWTVerifyGetKey): Promise<string>`, which returns the email in lowercase.
  - `identity: MiddlewareHandler<AppEnv>`, which sets `c.var.me`. Extend `AppEnv.Variables` to `{ me: Person }`.
  - `GET /api/me` → `Person`
  - `GET /api/people` → `Person[]`, sorted by `sort`, then `id`
  - `POST /api/people {name, email}` → `Person`. It also creates the room `"<name>'s room"` with `person_id`.
  - `PATCH /api/people/:id {name?, email?}` → `Person`

**Rules:**
- **Production mode** applies when `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` are both non-empty. The token comes from the `Cf-Access-Jwt-Assertion` header, falling back to the `CF_Authorization` cookie. It's verified with jose `jwtVerify` (issuer = team domain, audience = AUD). By default, keys come from `createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain))`. In production mode, `DEV_USER_EMAIL` is ignored.
- **Dev mode** applies otherwise: use `DEV_USER_EMAIL`. If neither mode is configured, return 500 `auth_not_configured`.
- **Matching:** the email is matched case-insensitively against `people.email`.
- **Bootstrap:** if `people` is empty, the first verified visitor is inserted, with their name set to the part of the email before `@` (my call, so the first login works). Anyone else with no matching row gets 403 `not_set_up` with `{ email }`.

- [ ] **Step 1: Write the failing tests**

```ts
// auth.test.ts: production mode uses a local key pair via jose generateKeyPair + createLocalJWKSet
it("accepts a valid Access JWT and lowercases the email", ...);      // token email "Gideon@Example.com" → "gideon@example.com"
it("rejects a JWT with the wrong audience", ...);                     // rejects
it("rejects a missing token in production mode even if DEV_USER_EMAIL is set", ...);
it("uses DEV_USER_EMAIL when Access is not configured", ...);
// people.test.ts
it("first visitor on an empty people table is created automatically", async () => {
  await resetDb();
  const me = await (await api("/api/me", { as: "gideon@example.com" })).json();
  expect(me).toMatchObject({ name: "gideon", email: "gideon@example.com" });
});
it("an unknown email gets 403 not_set_up once people exist", async () => {
  const res = await api("/api/me", { as: "stranger@example.com" });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: "not_set_up" });
});
it("matches emails case-insensitively", async () => {
  expect((await api("/api/me", { as: "GIDEON@example.com" })).status).toBe(200);
});
it("adding a person also creates their room", async () => {
  const lena = await post<Person>("/api/people", { name: "Lena", email: "lena@example.com" });
  const room = await env.DB.prepare("SELECT person_id FROM rooms WHERE name = ?").bind("Lena's room").first();
  expect(room?.person_id).toBe(lena.id);
});
it("rejects a duplicate email with 409", ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/auth.test.ts test/worker/people.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `resolveEmail`, `identity` and the people routes**

Validate request bodies with zod: name 1–60 characters, valid email. The person and their room are inserted in one `DB.batch`.

- [ ] **Step 4: Run them to see them pass**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker test/worker
git commit -m "feat: identify people via Access JWT and add people API"
```

---

### Task 5: Rooms API

**Files:**
- Create: `src/worker/routes/rooms.ts`, `test/worker/rooms.test.ts`
- Modify: `src/worker/app.ts`

**Interfaces:**
- Produces:
  - `GET /api/rooms` → `Room[]`, sorted by `sort`, then `id`
  - `POST /api/rooms {name, personId: number | null}` → `Room`, appended with sort = max + 1
  - `PATCH /api/rooms/:id {name?, personId?}` → `Room`
  - `PUT /api/rooms/order {ids: number[]}` → `Room[]`. It sets `sort` to the array index; the ids must be exactly all room ids, otherwise 400.
  - `DELETE /api/rooms/:id` → 204

- [ ] **Step 1: Write the failing tests**

```ts
it("lists rooms in sort order", ...);
it("reorders rooms", async () => {
  // PUT order [4,3,2,1] → GET returns Hallway first
});
it("rejects an order that misses a room", ...);                 // 400
it("deleting a room keeps its items under no room", async () => {
  // insert item in room 1 via SQL; DELETE /api/rooms/1 → 204; item.room_id is null
});
it("renames a room and marks it as someone's room", ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/rooms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the rooms routes**

Reorder is one `DB.batch` of updates.

- [ ] **Step 4: Run them to see them pass**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker test/worker
git commit -m "feat: add rooms API with reorder and safe delete"
```

---

### Task 6: Items API with privacy rules

**Files:**
- Create: `src/worker/items-query.ts`, `src/worker/routes/items.ts`, `test/worker/items.test.ts`
- Modify: `src/worker/app.ts`

**Interfaces:**
- Consumes: `itemPrice`, `plannedCents`, `spentCents`, `defaultPricePaid`, `ItemSummary`, `ItemDetail`.
- Produces:
  - `listVisibleItems(db: D1Database, meId: number): Promise<ItemSummary[]>`
  - `getVisibleItemRow(db, id, meId)`: the raw row, or `fail(404, "not_found")`
  - `assertCanEdit(row, meId)`: `fail(403, "read_only")` unless `for_person_id` is null or equals `meId`
  - `getItemDetail(db, id, meId): Promise<ItemDetail>`
  - `GET /api/items` → `ItemSummary[]`
  - `POST /api/items {name, roomId?: number | null, forMe?: boolean, ownPriceCents?: number | null}` → `ItemDetail`
  - `GET /api/items/:id` → `ItemDetail`
  - `PATCH /api/items/:id {name?, roomId?, forMe?, visibleToAll?, status?, payer?: Payer, quantity?, ownPriceCents?, pricePaidCents?, notes?}` → `ItemDetail`
  - `DELETE /api/items/:id` → 204

**Rules** (spec 6.5, 6.10, 6.11, 6.17, 7.2):
- **Visibility:** every read uses `(for_person_id IS NULL OR for_person_id = ? OR visible_to_all = 1)`. An invisible item is a 404 on every endpoint.
- **Creating:**
  - If `forMe` is omitted, it defaults to `true` when the room's `person_id` = me, otherwise `false`.
  - `forMe: true` sets `for_person_id = me`, `visible_to_all = 0` and `payer_person_id = me`.
- **Updating:**
  - `forMe: true` on a shared item sets `for_person_id = me`, `visible_to_all = 1`, payer = me and `paid_together = 0`.
  - `forMe: false` sets `for_person_id = NULL`.
  - `visibleToAll` on a shared item → 400. `payer` on a personal item → 400.
  - Changing status to `bought` while `price_paid_cents` is null and no `pricePaidCents` was sent sets `price_paid_cents = defaultPricePaid(...)`.
  - `quantity` is an integer ≥ 1. Prices are integers ≥ 0, or null.
  - Edits and deletes call `assertCanEdit`. `updated_at` is set on every patch.
- **Payer mapping:** `{kind: "person"}` → `payer_person_id = id, paid_together = 0`; `together` → `NULL, 1`; `none` → `NULL, 0`.
- **Lists:** `ideaCount` and the pricing input come from one query plus one ideas query for the visible item ids. Don't make one query per item.

- [ ] **Step 1: Write the failing tests**

Seed Gideon (id 1) and Lena (id 2), plus Kitchen and "Gideon's room" (person 1).
```ts
it("new item in my own room defaults to just me and hidden", async () => {
  const item = await post("/api/items", { name: "Bed frame", roomId: gideonsRoom });
  expect(item).toMatchObject({ forPersonId: 1, visibleToAll: false, payer: { kind: "person", personId: 1 } });
});
it("a hidden personal item is invisible to others everywhere", async () => {
  const id = (await post("/api/items", { name: "Desk", forMe: true })).id;
  const lenaList = await (await api("/api/items", { as: "lena@example.com" })).json();
  expect(lenaList.map((i: ItemSummary) => i.id)).not.toContain(id);
  expect((await api(`/api/items/${id}`, { as: "lena@example.com" })).status).toBe(404);
  expect((await api(`/api/items/${id}`, { as: "lena@example.com", method: "PATCH", body: { name: "x" } })).status).toBe(404);
});
it("show to everyone makes it visible but read-only for others", async () => {
  // PATCH visibleToAll true as Gideon; Lena GET → 200 with canEdit false; Lena PATCH → 403 read_only
});
it("switching a shared item to just me keeps it visible", async () => {
  // shared item → PATCH forMe true → visibleToAll true, payer me
});
it("rejects payer changes on personal items and visibleToAll on shared items", ...);   // 400, 400
it("marking bought fills price paid from the own price × quantity", async () => {
  // ownPriceCents 1900, quantity 2 → PATCH status bought → pricePaidCents 3800, price {kind:"paid",cents:3800}
});
it("owned items report no price", ...);
it("paid together is stored and returned", ...);  // payer {kind:"together"}
it("quick add with name only lands in no room as shared", async () => {
  expect(await post("/api/items", { name: "Pan" })).toMatchObject({ roomId: null, forPersonId: null });
});
it("rejects quantity 0 and negative prices", ...);  // 400
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/items.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `items-query.ts` and the item routes**

- [ ] **Step 4: Run them to see them pass**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker test/worker
git commit -m "feat: add items API with private personal items"
```

---

### Task 7: Ideas and favorites API

**Files:**
- Create: `src/worker/routes/ideas.ts`, `test/worker/ideas.test.ts`
- Modify: `src/worker/app.ts`

**Interfaces:**
- Consumes: `getVisibleItemRow`, `assertCanEdit`, `getItemDetail`.
- Produces:
  - `POST /api/items/:id/ideas {title, url?, priceCents?, imageUrl?, notes?}` → `ItemDetail`
  - `PATCH /api/ideas/:id {title?, url?, priceCents?, imageUrl?, notes?}` → `ItemDetail`
  - `DELETE /api/ideas/:id` → `ItemDetail`
  - `PUT /api/items/:id/favorite {ideaId: number | null}` → `ItemDetail`
  - `shopFromUrl(url: string): string`, which returns the hostname without `www.`, or `""` if the URL is invalid.

**Rules:**
- Every idea endpoint first loads its item with `getVisibleItemRow` (so a hidden item gives 404), then calls `assertCanEdit`.
- `shop` is recomputed whenever `url` changes.
- **Starring** is one `DB.batch`:
  1. Clear `is_favorite` on the item's ideas.
  2. Set it on `ideaId`.
  3. If the status is `needed`, set it to `decided`.
- **Unstarring** (`ideaId: null`) or deleting the favorite idea: if the status is `decided`, set it to `needed`. `bought` and `owned` never change from favorite actions (spec 6.2).
- An `ideaId` that isn't one of this item's ideas → 400 `idea_not_on_item`.

- [ ] **Step 1: Write the failing tests**

```ts
it("starring an idea sets the item price and moves needed to decided", async () => {
  // item qty 1, ideas €749 and €1,190; PUT favorite ideaA
  expect(detail).toMatchObject({ status: "decided", price: { kind: "favorite", cents: 74900 } });
});
it("switching the favorite keeps exactly one favorite", ...);       // ideas.filter(isFavorite).length === 1
it("unstarring moves decided back to needed and falls back to own price", ...);
it("deleting the favorite idea reverts status and price", ...);
it("favorite actions never change bought or owned", ...);
it("rejects an idea from another item", ...);                        // 400 idea_not_on_item
it("cannot add ideas to someone else's hidden item", ...);           // 404 as Lena
it("derives the shop from the link", () =>
  expect(shopFromUrl("https://www.example-shop.de/sofa?id=1")).toBe("example-shop.de"));
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/ideas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the idea and favorite routes**

- [ ] **Step 4: Run them to see them pass**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker test/worker
git commit -m "feat: add ideas and favorite selection with status automation"
```

---

### Task 8: Overview API

**Files:**
- Create: `src/worker/overview.ts`, `src/worker/routes/overview.ts`, `test/worker/overview.test.ts`
- Modify: `src/worker/app.ts`

**Interfaces:**
- Consumes: `listVisibleItems`, `Person`, `ItemSummary`, `Overview`.
- Produces:
  - `computeOverview(meId: number, people: Person[], items: ItemSummary[]): Overview`
  - `GET /api/overview` → `Overview`

**Rules** (spec 6.7, 6.8, 6.17), computed for each mode: `planned` uses `plannedCents`, `spent` uses `spentCents`.
- **Person rows:** one row per person, `key = "person:<id>"`, `label = name`.
  - `ownCents` = items with `forPersonId = id`.
  - `sharedCents` = items with `forPersonId = null` and payer `person id`.
- **Together row:** `key "together"`, label `"Paid together"`. `sharedCents` = shared items with payer `together`.
- **Unassigned row:** `key "unassigned"`, label `"Nobody set yet"`. `sharedCents` = shared items with payer `none`.
- `me` = the viewer's row, with `totalCents = own + shared`.
- Only the items the viewer can see are counted, so another person's hidden items never appear in any number.

- [ ] **Step 1: Write the failing tests**

```ts
it("splits own and shared per person in planned mode", ...);
it("puts shared items without payer under nobody set yet and joint ones under paid together", ...);
it("spent mode counts only bought items", ...);
it("never counts another person's hidden items", async () => {
  // Lena has a hidden €320 wardrobe and a shown €150 chair
  const o = await (await api("/api/overview", { as: "gideon@example.com" })).json();
  expect(o.planned.rows.find((r: OverviewRow) => r.key === "person:2").ownCents).toBe(15000);
});
it("the viewer sees their own hidden items in their own numbers", ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/overview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `computeOverview` and the route**

- [ ] **Step 4: Run them to see them pass**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker test/worker
git commit -m "feat: add overview totals that respect privacy"
```

---

### Task 9: Web foundation: API client, formatting, app shell

**Files:**
- Create: `src/web/api.ts`, `src/web/format.ts`, `src/web/components/PriceLabel.tsx`, `src/web/components/StatusPill.tsx`, `test/web/format.test.ts`, `test/web/PriceLabel.test.tsx`
- Modify: `src/web/main.tsx`, `src/web/App.tsx`, `src/web/styles.css`

**Interfaces:**
- Consumes: all `src/shared/types.ts` types, plus every endpoint from Tasks 4–8.
- Produces:
  - `formatEuro(cents: number): string`: `74900` → `"€749"`, `1999` → `"€19.99"`, `119000` → `"€1,190"`. Uses `Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" })`, with no decimals for whole euros.
  - `formatPrice(p: PriceInfo): string`:
    - `paid` / `favorite` → `"€749"`
    - `own` → `"≈ €19"`
    - `range` → `"€150–260"` (en dash, euro sign once)
    - `none` → `""`
  - `parseEuroInput(s: string): number | null | "invalid"` (cents):
    - `""` → `null`
    - Currency symbols and spaces are stripped.
    - With one separator, `,` or `.` followed by 1–2 digits is a decimal separator. Followed by exactly 3 digits, it's a thousands separator.
    - With both separators, the last one is the decimal separator.
    - Negative or non-numeric → `"invalid"`.
  - `api` hooks built with TanStack Query: `useMe`, `usePeople`, `useRooms`, `useItems`, `useItem(id)`, `useOverview`, plus mutations `useCreateItem`, `usePatchItem`, `useDeleteItem`, `useAddIdea`, `usePatchIdea`, `useDeleteIdea`, `useSetFavorite`, `useRoomMutations`, `usePeopleMutations`. Every mutation invalidates `["items"]`, `["item", id]` and `["overview"]`, as relevant.
  - The `QueryClient` keeps the default `refetchOnWindowFocus: true` (spec 7.4).
  - `<PriceLabel price={PriceInfo} />` and `<StatusPill status={Status} />`
  - `App` routes (wouter): `/` → MovingList, `/items/:id` → ItemPage, `/overview`, `/rooms`, `/people`. A fixed bottom nav has four tabs: List, Overview, Rooms, People.
  - A `403 not_set_up` from `/api/me` renders a full-screen message: "You're signed in as {email}, but you haven't been added yet. Ask a flatmate to add you under People."

- [ ] **Step 1: Write the failing tests**

```ts
it.each([["19", 1900], ["19,99", 1999], ["19.99", 1999], ["€ 19,5", 1950], ["1.190", 119000], ["1,190", 119000], ["1.190,50", 119050], ["1,190.50", 119050]])(
  "parses %s", (s, cents) => expect(parseEuroInput(s)).toBe(cents));
it("empty is null, garbage is invalid", () => {
  expect(parseEuroInput("  ")).toBeNull();
  expect(parseEuroInput("abc")).toBe("invalid");
  expect(parseEuroInput("-5")).toBe("invalid");
});
it("formats prices", () => {
  expect(formatPrice({ kind: "own", cents: 1900 })).toBe("≈ €19");
  expect(formatPrice({ kind: "favorite", cents: 119000 })).toBe("€1,190");
  expect(formatPrice({ kind: "range", minCents: 15000, maxCents: 26000 })).toBe("€150–260");
  expect(formatEuro(1999)).toBe("€19.99");
});
// PriceLabel.test.tsx
it("marks own prices as approximate for screen readers too", () => {
  render(<PriceLabel price={{ kind: "own", cents: 1900 }} />);
  expect(screen.getByText("≈ €19")).toHaveAttribute("title", "Estimate");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.config.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `format.ts`, the components, the API client and the app shell**

Color tokens live in `styles.css` as CSS variables, with dark values under `@media (prefers-color-scheme: dark)`:
- `--own: #2a78d6` / `#3987e5`
- `--shared: #eb6834` / `#d95926`
- `--together: #1baf7a` / `#199e70`
- `--unassigned: #b4b2ad` / `#6b6a66`

Status pill styles: Needed is neutral, Decided is the accent color, Bought is green, Owned is dashed and muted.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run --config vitest.config.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web test/web
git commit -m "feat: add web app shell, API hooks and price formatting"
```

---

### Task 10: Moving list screen

**Files:**
- Create: `src/web/grouping.ts`, `src/web/components/QuickAdd.tsx`, `src/web/pages/MovingList.tsx`, `test/web/grouping.test.ts`

**Interfaces:**
- Consumes: `useItems`, `useRooms`, `useMe`, `useCreateItem`, `PriceLabel`, `StatusPill`, `parseEuroInput`.
- Produces:
  - `type ListFilter = "all" | "shared" | "mine" | "needed"`
  - `groupByRoom(rooms: Room[], items: ItemSummary[], meId: number, filter: ListFilter): { room: Room | null; items: ItemSummary[]; subtotalCents: number }[]`

**Rules** (spec 5.6, 6.12–6.14):
- **Filters:** `shared` = `forPersonId === null`; `mine` = `forPersonId === meId`; `needed` = status `needed` or `decided`.
- **Room blocks:** shown in room `sort` order. A room appears if it has items after filtering, or if it's the viewer's own room and the filter is `all` or `mine`.
- **"No room"** (`room: null`) comes last, and only if it has items.
- **Subtotal** = the sum of `plannedCents`.
- **Each row shows:**
  - The name, and a subline: "Everyone" or "Just you", the idea count, and the payer name, "Together" or "paid by: not set". For owned items, the subline shows whose it is instead ("Gideon's").
  - An "only you" marker when the item is personal and not visible to all.
  - `StatusPill` and `PriceLabel`.
  - Tapping a row navigates to `/items/:id`.
- **QuickAdd** is a single row at the top: name (required), a room select (default "No room") and a price (optional, parsed with `parseEuroInput`). An `"invalid"` price shows an inline error and doesn't submit. On submit it posts `{name, roomId, ownPriceCents}` and clears the name field.
- **Empty state** (no items at all): "Nothing planned yet. Add the first thing you need above."

- [ ] **Step 1: Write the failing tests**

```ts
it("orders rooms by sort and puts no room last", ...);
it("hides empty rooms but always shows my own room under all and mine", ...);
it("filters shared, mine and still needed", ...);
it("subtotals use planned cents", ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --config vitest.config.ts test/web/grouping.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `grouping.ts`, `QuickAdd` and the `MovingList` page**

Follow mockup layout B (`.superpowers/brainstorm/56576-1795005113/content/screens-v1.html`, section 1, second card).

- [ ] **Step 4: Run the tests to see them pass, then check the screen in the browser**

Run: `npx vitest run --config vitest.config.ts`
Expected: PASS.
With `mise run dev` running, open the app in the browser pane at 375 px width (`resize_window` preset mobile). Quick-add "Pan" with no room and "Shower curtain" with price "19,99" in Bathroom. Expected: "Pan" appears under "No room", and "Shower curtain" shows `≈ €19.99` with a Bathroom subtotal of `€19.99`.

- [ ] **Step 5: Commit**

```bash
git add src/web test/web
git commit -m "feat: add moving list grouped by room with quick add"
```

---

### Task 11: Item page

**Files:**
- Create: `src/web/pages/ItemPage.tsx`

**Interfaces:**
- Consumes: `useItem`, `usePatchItem`, `useDeleteItem`, `useAddIdea`, `usePatchIdea`, `useDeleteIdea`, `useSetFavorite`, `usePeople`, `useRooms`, `PriceLabel`, `StatusPill`, `parseEuroInput`, `formatEuro`.

**Rules** (spec 7.3, item 2):
- **Header:** the name (editable) and `PriceLabel`.
- **Fields, saved on change:**
  - Room (including "No room")
  - For: Everyone / Just me
  - "Show to everyone": a checkbox, shown only for my personal items
  - Quantity
  - Own price: disabled, with the note "Using the starred idea's price", while a favorite exists
  - Status
  - Paid by: people, Together, Not set. Hidden for personal items.
  - Price paid: shown only when the status is `bought`
  - Notes
- **Ideas:** a list of rows, each with a star button (`aria-pressed`), title, shop, price and notes. The row shows a thumbnail when `imageUrl` is set. Tapping the star of the current favorite unstars it. Each idea can be edited inline (including an optional image link) or deleted. Below the list, an add-idea box takes the link first, then title and price.
- **When the status is `owned`:** hide the price fields and the ideas section (spec 5.3). "Paid by" stays and is relabelled "Belongs to" (spec 6.5).
- **When `canEdit` is false:** everything is read-only, with the note "This is {name}'s item."
- **Delete item:** a button that asks for confirmation, then navigates to `/`.
- A 404 shows "This item doesn't exist or isn't shared with you."

- [ ] **Step 1: Build the page against the existing hooks**

The behavior is already covered by the API tests in Tasks 6–7, so this task is verified in the browser.

- [ ] **Step 2: Check it in the browser at 375 px**

1. Open "Sofa". Add three ideas (€749, €1,190, €200), then star €749. Expected: header `€749`, status Decided.
2. Unstar it, then type own price "700". Expected: header `≈ €700`, status Needed.
3. Set the status to Owned. Expected: the price fields and ideas disappear.
4. As a second identity (set `DEV_USER_EMAIL` to a second seeded person in `.dev.vars` and restart), open a shown personal item. Expected: read-only.

- [ ] **Step 3: Run all tests**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web
git commit -m "feat: add item page with ideas, favorite star and privacy toggle"
```

---

### Task 12: Overview screen

**Files:**
- Create: `src/web/components/PersonBars.tsx`, `src/web/pages/Overview.tsx`, `test/web/PersonBars.test.tsx`

**Interfaces:**
- Consumes: `useOverview`, `formatEuro`, `OverviewMode`.
- Produces: `<PersonBars mode={OverviewMode} />`

**Rules** (spec 6.15, dataviz method):
- A segmented control switches between **Planned** and **Actually spent** (default Planned).
- **Three tiles:** "Your own things", "Shared things you pay", "You in total".
- **Bars:** one horizontal stacked bar per person (own = `--own`, shared = `--shared`, with a 2 px gap between segments and a 4 px rounded end). The "Paid together" bar (`--together`) and "Nobody set yet" bar (`--unassigned`) appear only when greater than 0.
- **Labels:** the total value is shown after each bar, and every segment has a hover/focus tooltip with name, part and amount.
- **Legend** above the bars. A "Show as table" toggle renders the same numbers as a table.
- The scale maximum is the largest row total. If everything is 0, show "Nothing to count yet."

- [ ] **Step 1: Write the failing test**

```tsx
it("renders a bar per person and hides empty together/unassigned rows", () => {
  render(<PersonBars mode={{ me: { ownCents: 22900, sharedCents: 1900, totalCents: 24800 }, rows: [
    { key: "person:1", label: "Gideon", ownCents: 22900, sharedCents: 1900 },
    { key: "together", label: "Paid together", ownCents: 0, sharedCents: 0 },
    { key: "unassigned", label: "Nobody set yet", ownCents: 0, sharedCents: 74900 } ] }} />);
  expect(screen.getByText("Gideon")).toBeInTheDocument();
  expect(screen.getByText("€248")).toBeInTheDocument();
  expect(screen.queryByText("Paid together")).toBeNull();
  expect(screen.getByText("Nobody set yet")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --config vitest.config.ts test/web/PersonBars.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `PersonBars` and the `Overview` page**

Follow mockup section 3, without the "Whole flat" tile.

- [ ] **Step 4: Run it to see it pass, then check light and dark mode in the browser**

Run: `npx vitest run --config vitest.config.ts`
Expected: PASS. Then check the screen in the browser pane at 375 px, in both color schemes (`resize_window` with `colorScheme` set to light and to dark).

- [ ] **Step 5: Commit**

```bash
git add src/web test/web
git commit -m "feat: add overview with per-person bars and planned/spent toggle"
```

---

### Task 13: Rooms and People screens

**Files:**
- Create: `src/web/pages/Rooms.tsx`, `src/web/pages/People.tsx`

**Interfaces:**
- Consumes: `useRooms`, `useRoomMutations`, `usePeople`, `usePeopleMutations`.

**Rules** (spec 7.3, items 4–5):
- **Rooms:**
  - A list in sort order. Each row has the name (inline edit), an owner select (Shared or a person) and up/down buttons. On screens ≥ 768 px, rows can also be dragged with native HTML drag-and-drop.
  - Reordering calls `PUT /api/rooms/order` with the full id list.
  - "Add room" sits at the bottom.
  - Delete asks "Delete {name}? Its items move to No room." and then calls `DELETE`.
- **People:** a list with name and email (inline edit), plus an add form with name and email. A 409 shows "Someone with that email already exists." The helper text reads: "Adding someone here lets them in once their email is also on the Cloudflare Access list."

- [ ] **Step 1: Build both pages**

- [ ] **Step 2: Check them in the browser**

1. Add "Balcony", move it to the top, then delete it while it holds an item. Expected: the item now appears under "No room" in the list.
2. Add person "Lena". Expected: "Lena's room" appears in Rooms.

- [ ] **Step 3: Run all tests**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web
git commit -m "feat: add rooms and people management screens"
```

---

### Task 14: Deploy to Cloudflare (with Gideon)

This task needs Gideon at specific steps. The executor stops and asks at each step marked **Gideon**.

**Files:**
- Modify: `cloudflare.config.ts` (D1 id, production vars, custom domain if any), `docs/superpowers/specs/2026-11-18-wg-planner-design.md` (section 9 answers)

- [ ] **Step 1: Sign in (Gideon approves in the browser)**

Run `cf auth login` in the background. **Gideon** checks that the code matches and approves. Then run `cf whoami`. Expected: Gideon's account.

- [ ] **Step 2: Settle the domain question**

Find the command with `cf cli search "list zones"`, then run it. Report to Gideon whether the domain is present and active. Record the answer in spec section 9.

- [ ] **Step 3: Create the remote D1 database and migrate it**

Find the command with `cf cli search "create a D1 database"`, create `wg-planner`, and put its id into `bindings.d1({ name: "wg-planner", id })`. Then run `mise run db:migrate:remote`. Expected: both migrations applied.

- [ ] **Step 4: Zero Trust and Access (Gideon)**

1. **Gideon** signs up for Zero Trust (Free plan, team name; it asks for a card that isn't charged).
2. Add the **One-time PIN** identity provider. New organizations default to Cloudflare-account login, which the flatmates don't have.
3. Create a self-hosted Access application for the Worker's hostname, with an Allow policy that includes the flatmates' emails, which **Gideon** provides.

Use `cf cli search` to find the Access commands. If the sign-in scopes don't cover them, give Gideon a short click-by-click checklist instead. Copy the team domain (`https://<team>.cloudflareaccess.com`) and the application's AUD tag into the production vars in `cloudflare.config.ts`.

- [ ] **Step 5: Deploy and verify**

Run `mise run deploy` (tests run first). Expected: a `workers.dev` URL.
1. Request it without a session using `curl -sI <url>/api/me`. Expected: an Access redirect or 403, never JSON from the app.
2. **Gideon** opens the URL, logs in with a one-time PIN, and lands on the moving list as the first person.

- [ ] **Step 6: Custom domain (only if the zone is active on Cloudflare)**

Find the custom-domain syntax with `cf cli search "add a custom domain to a Worker"`. Attach `wg.<domain>`, add that hostname to the Access application, redeploy, and repeat Step 5's checks on the new hostname.

- [ ] **Step 7: Commit**

```bash
git add cloudflare.config.ts docs/superpowers/specs/2026-11-18-wg-planner-design.md
git commit -m "chore: deploy to Cloudflare behind Access"
```
