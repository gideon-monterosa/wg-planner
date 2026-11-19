# Ideas tab + UI/UX polish: plan

Date: 2026-11-19. Requested by Gideon. Decisions were made without his input and are listed at the end for him to verify.
Builds on the v1 spec (`docs/superpowers/specs/2026-11-18-wg-planner-design.md`) and the current code on `main`.

## Goals
1. **Ideas tab:** a separate tab for capturing product ideas quickly, in addition to the ideas section in the item modal.
   - Ideas can exist **without an item** ("unlinked") and can be linked later.
   - The tab groups ideas by **room → item**, with **unlinked ideas on top**.
   - Privacy: you see your own unlinked ideas, plus ideas on items you're allowed to see. Ideas on someone's hidden item stay invisible.
2. **UI/UX pass:** hunt down layout, colour and contrast problems.
   - Keep the design mobile first, but make it look good on a computer.
   - Test both phone (375 px) and desktop (1280 px) widths, in light and dark mode.

Non-goals: AI link import, floor plan, production deploy (integration only).

## Data model change (migration `0003_unlinked_ideas.sql`)
SQLite can't drop NOT NULL in place, so recreate `ideas` with data preserved:
- `item_id INTEGER NULL REFERENCES items(id) ON DELETE CASCADE`. NULL means unlinked.
- `CHECK (item_id IS NOT NULL OR is_favorite = 0)`: an unlinked idea can't be a favorite.
- Keep the other columns and the partial unique index `ideas_one_favorite`, and add an index on `item_id`.
- Copy the rows over (`INSERT INTO ideas_new SELECT …`), drop the old table, rename the new one, recreate the indexes.

## Visibility and edit rules (server-enforced)
- **Visible ideas** are those where `item_id IS NULL AND created_by = me`, or `item_id` points at an item the viewer can see (the existing `VISIBLE` predicate).
- **Edit or delete an idea:**
  - Unlinked: only its creator.
  - Linked: whoever can edit the item (the existing `assertCanEdit`).
- **Link, move or unlink** (`itemId` in a PATCH): you must be able to edit the idea as it is now *and* the target item.
  - Moving or unlinking a favorite clears the star and, on the old item, moves `decided` → `needed` (same rule as unstarring).
- An idea someone can't see behaves as nonexistent (404), as everywhere else.

## API
- `GET /api/ideas` → `IdeaWithItem[]`: every visible idea plus a small item reference (`itemId`, `itemName`, `roomId`, `itemStatus`, `forPersonId`, `visibleToAll`, `canEditItem`) and `canEdit`, `isMine`, `isFavorite`.
- `POST /api/ideas {title, url?, priceCents?, imageUrl?, notes?, shop?, itemId?}` creates an idea. With `itemId` it's linked, after an edit check. `title` is optional when `url` is given: it falls back to the shop or host of the URL.
- `PATCH /api/ideas/:id` gains `itemId: number | null` (link, move or unlink).
- `POST /api/ideas/:id/to-item {roomId?}` creates a new item named after the idea and links the idea to it. The item is "for everyone", unless the room is the creator's own room; the same default as quick add.
- Existing endpoints keep working: POST `/api/items/:id/ideas`, DELETE, and PUT favorite.
- URL scheme check (http/https only) and the JSON-only content-type check apply as before.

## Web
- **Navigation:** three tabs: **List · Ideas · Overview**. The gear for Settings stays in the header.
- **Ideas tab (`/ideas`):**
  - **Quick capture** at the top: paste a link (required, unless a title is typed), optional title and price, and an optional "for item" picker. Enter adds the idea.
  - **Unlinked** section first ("Not linked yet"). Each card has: open link, price, "Link to item…" (a searchable select of items you can edit), "Make item" (`to-item`) and delete.
  - **Then grouped by room → item.** Room headers in room order, "No room" last. Under each item: its ideas with a star toggle, price, shop and link. Tapping the item name opens the existing item modal.
  - **Filter chips:** All · Not linked · Mine.
  - **Empty state:** short help text explaining unlinked ideas.
  - A small hint when linking to a shared item: "Everyone who can see this item will see the idea."
- **Item modal:** the ideas section gains "Add from your saved ideas", a select listing your unlinked ideas that links the chosen one.

## Responsive shell and UI fixes
- **Mobile (<768 px):** unchanged structure, with a bottom nav of three tabs.
- **Desktop (≥768 px):**
  - A top app bar holds the title, the tabs and the gear; the bottom nav is hidden.
  - Content goes up to `max-w-5xl`.
  - The moving list and Ideas use a responsive grid of room cards (2 columns ≥1024 px).
  - Overview tiles in a row; Settings Rooms and People side by side ≥1024 px.
  - The item modal stays a centered dialog (`max-w-2xl`).
- **Audit-driven fixes:** a read-only audit agent checks every screen at 375 and 1280 px, light and dark, for overflow, truncation, clipped controls, contrast below WCAG AA, inconsistent spacing, unlabelled controls, focus visibility and empty or loading states. Its findings file drives the fix task. The audit must list concrete file:line fixes.

## Tasks and order (delegated)
1. **T1 Ideas API** (worktree): migration, query and API, tests (privacy for unlinked and hidden-item ideas, link/move/unlink rules, favorite clearing, to-item, migration keeps data). In parallel with T2.
2. **T2 UI/UX audit** (read-only, browser): findings at `.superpowers/sdd/ideas-ui/audit.md`.
3. **T3 Responsive shell + audit fixes** (worktree, after T2): desktop top bar, 3-tab nav with an Ideas stub page, layouts, contrast and overflow fixes, tests.
4. **T4 Ideas tab + modal "add from saved ideas"** (worktree, after T1 and T3): page, components, hooks, tests.
5. **Review each task** (fresh reviewer, fix loop), then an **integration check** in the browser at both widths and both themes, then a final review and one fix wave.
6. **Push `main`:** CI runs the tests and deploys to **integration** (including migration 0003). Verify https://wg-int.monterosa.dev responds and redirects to the login. **No tag, so no production deploy.**

## Decisions made for Gideon (verify later)
1. **Unlinked ideas are private to their creator.** Linking one to an item makes it visible to whoever can see that item.
2. **"Group" means room.** The layout is Room → Item → ideas, with unlinked on top and "No room" last.
3. **Linking needs edit rights on the target item.** Shared items can be edited by anyone; personal items only by their owner.
4. **Moving or unlinking a favorite clears the star** and moves the old item `decided` → `needed`.
5. **"Make item" doesn't star the idea.** The new item starts as *needed* with the idea's price shown as a range, so starring stays a deliberate choice.
6. **The title is optional when a link is given.** It falls back to the shop or host. Editing it later is possible.
7. **Filters are All / Not linked / Just mine.**
8. **Desktop gets a top nav and a wider multi-column layout.** Mobile keeps the bottom nav.
9. **The item modal gains "Add from your saved ideas".**
11. **Only an idea's creator can link, move, unlink or "make item" it.** Others who can edit a shared item can still edit an idea's details and star it, but they can't move someone else's idea away. Moving it onto a hidden item would otherwise make it vanish for the person who added it.
10. **Integration only.** Push to `main` deploys integration; production waits for a `v1.1.0` tag from Gideon.
12. **Turning a shared item into "Just me" unlinks other people's ideas.** In PATCH `/api/items/:id`, when `forMe: true` switches a shared item to personal, set `item_id = NULL, is_favorite = 0` on ideas whose `created_by != me`, in the same batch. Their creators keep them in their private "Not linked yet" list.
13. **Deleting an item unlinks other people's ideas instead of deleting them.** In DELETE `/api/items/:id`, first set `item_id = NULL, is_favorite = 0` on ideas whose `created_by != me`, then delete the item; the deleter's own ideas cascade away as before.
