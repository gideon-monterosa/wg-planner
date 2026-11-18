# WG Planner: v1 report

Date: 2026-11-18 · Branch: `main`, committed locally, not pushed and not deployed.
Spec: [design](superpowers/specs/2026-11-18-wg-planner-design.md) · Plan: [v1 plan](superpowers/plans/2026-11-18-wg-planner-v1.md)

## What v1 does

**The moving list**
- Items are grouped by room, with a subtotal per room and a "No room" block at the end.
- Filters: All, Shared, Mine, Still needed.
- Quick add takes a name, plus an optional room and price. Prices can be typed German- or English-style ("19,90", "1'190", "19.–").

**Items and ideas**
- Each item has a room, who it's for (Everyone or Just me), quantity, status (needed → decided → bought, or already owned), paid by (a person, Together, or not set), price paid and notes.
- Ideas have a title, link, shop (taken from the link unless typed), price, image link and notes.
- Starring an idea makes its price the item's price and marks the item *decided*. Unstarring moves it back to *needed*.
- Price shown, in this order:
  1. the price paid
  2. the starred idea's price
  3. the item's own price, shown as "≈ CHF 19.–"
  4. a range across the ideas, which isn't counted in totals

  Owned items have no price at all.

**Privacy**
- Personal items are hidden from the others until their owner ticks "Show to everyone".
- The server enforces this on every endpoint, totals included. For anyone else, a hidden item behaves as if it doesn't exist.

**Overview**
- Shows your own things, the shared things you pay for, and your total, either as planned or as actually spent.
- A bar chart per person, plus "Paid together" and "Nobody set yet" bars, with a legend, tooltips and a table view.
- There is no whole-flat total.

**Rooms and People**
- Rooms can be added, renamed, assigned to a person or shared, reordered (up/down buttons, or drag on wide screens) and deleted. Deleting a room moves its items to "No room".
- People can be added and edited. Adding a person also creates their room.

**Login**
- The app checks the Cloudflare Access login token (signature, issuer and audience). This fails closed: a partial Access setup returns an error instead of falling back to the dev identity.
- The first person to visit is added automatically. Anyone else who isn't on the People list gets a clear "not set up yet" screen.

**Security**
- Idea links must be http(s) URLs.
- Every endpoint returns errors in the same `{error, message}` shape.
- The API only accepts JSON request bodies.

## How it was verified

**Automated tests: 129, all passing.**
- 85 run against the API in the Workers runtime with a real D1 database. They cover privacy on every endpoint, the favorite and status rules, room deletion, overview totals and login.
- 44 cover the web side: formatting and parsing, grouping, components, color contrast and the error code.
- `mise run typecheck` and `vite build` are clean.

**Process**
- Each of the 13 tasks had its own spec-and-quality review.
- A full end-to-end run with the local dev server covered the API with curl, as two different people, and the screens at phone width (375 px), light and dark.
- A final review of the whole codebase came next. Its fixes were re-reviewed: all addressed, nothing new broken.

**Not checked in a real browser:**
- the "not set up yet" screen
- dragging rooms on wide screens
- the 375 px room-name layout after the last fix (only the CSS class is tested)

## Running it locally

```bash
mise install && npm install
cp .dev.vars.example .dev.vars
mise run db:migrate
mise run dev
mise run test
```

Any existing checkout must run `mise run db:migrate` once again, because the local database location changed during integration.

## Next step: deploy (plan Task 14, needs Gideon)

Deploys now run from GitHub Actions to two environments, integration and production; see [deployment.md](deployment.md). Still to do once:

1. Check whether the domain is on Cloudflare.
2. Create the `wg-planner-int` and `wg-planner` D1 databases and put their IDs in `environments.json`.
3. Gideon signs up for Zero Trust (Free plan; a card is asked for but not charged).
4. Add the One-time PIN login method and create an Access app per environment with the flatmates' emails. Set the cookie to SameSite=Lax.
5. Fill in `accessTeamDomain` and `accessAud` in `environments.json`, and add the GitHub environments and secrets.
6. Optionally attach `wg.<domain>`.

## v2 and later

**Features from the spec**
- AI import from a pasted link (name, price, photo).
- Smart add: AI suggests the room and other fields from the item name.
- The floor plan: rooms to scale, with furniture you can drag, linked to items.
- Live updates (Durable Objects) if refetching on focus isn't enough.
- CSV/JSON export.

**Hardening and polish deferred from reviews**

Security
- Guard against editing someone's email to take over their person record. This needs a second email on the Access list.

Code quality
- Turn on strict TypeScript for the web code, and put test folders under typecheck.
- Close small read-then-write races (room reorder, starring, item PATCH/DELETE ownership in the `WHERE` clause).
- Fix the first-login bootstrap race.
- Move `insertPerson` out of `auth.ts`.
- Detect UNIQUE errors without string matching.
- Remove the unused `@hono/zod-validator`.

UI rough edges
- On the item page, star, delete and idea errors fail silently.
- An idea edit draft isn't reset on Cancel.
- An empty item name isn't reverted.
- Endless "Loading…" on a malformed item URL.
- Blank list when a filter matches nothing.
- No retry after a generic error.
- The nav has no aria-label.
- The overview tooltip isn't anchored to its bar.
- Editing only an idea's link in the UI keeps the old shop.

Tests
- Thin spots: range × quantity, spent mode for the Together and Nobody-set rows, re-hiding an item, clearing a price or link, Overview page states.

**Tooling note:** upgraded to cf 1.0.0-rc.1 and `@cloudflare/vite-plugin` 2.0.0-rc.1, which removed the old 1.64.0 pin. Local state now lives in `.cloudflare/state`, so existing checkouts run `mise run db:migrate` once more.
