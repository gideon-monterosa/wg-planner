# WG Planner: design

Date: 2026-11-18
Status: approved by Gideon on 2026-11-18

## 1. Intent

Gideon is moving into a shared flat (WG) with friends. They need one shared
place to plan what the flat needs: furniture and household items, both for
everyone and for each person's own room. For each item they want to collect
product ideas with prices, pick a favorite, and see what everything costs.

A spreadsheet broke down at one concrete point. Gideon wanted to attach
several product ideas to one item on the moving list, mark one as the
favorite, and have the item's price follow the favorite automatically. That
link between items and ideas is the core of the app.

After the move, the same data becomes the flat's inventory: what's there,
whose it is, and who paid for it.

**Who uses it:** Gideon plus the flatmates (a handful of people), mostly on
phones and sometimes on laptops. Everyone gets the same link.

**Success looks like:** adding an item or an idea is as quick as typing a row
into a spreadsheet; starring a favorite updates every total right away; and
anyone can see at a glance what they're spending on their own things, what
they're paying for shared things, and the total for the whole flat.

## 2. Goals, non-goals, anti-goals

**Goals (first version)**
- A moving list of items, grouped by room, with filters.
- Product ideas per item, with one favorite that sets the item's price.
- Items are either for everyone or for one person. Personal items are
  private unless their owner ticks "Show to everyone".
- Items without a room collect under "No room"; rooms have their own
  editing screen.
- Statuses: needed, decided, bought, already owned.
- Recording who pays for each item (or, for owned items, whose it is).
- An overview with totals per person, and a chart, for planned and actually
  spent amounts.
- Shared through one link on Gideon's own domain. Only the invited flatmates
  can get in.

**Non-goals (first version)**
- Splitting costs or settling up. The flatmates decide that between
  themselves; the app only records who paid. (Gideon's explicit decision.)
- AI import from a pasted link, and AI suggestions when adding an item
  (both planned for later; see section 8).
- The floor plan (planned for later; see section 8).
- Live updates while two people look at the same screen.
- Image uploads, multiple currencies, task or to-do lists.
- Importing the old spreadsheet. Gideon chose to start fresh.

**Anti-goals: failure even if it technically works**
- Any recurring cost beyond the domain Gideon already pays for.
- Flatmates having to create accounts or remember passwords.
- Adding an item or idea taking noticeably longer than adding a spreadsheet
  row.
- A layout that is painful on a phone.

## 3. Constraints

- **Free.** Everything must fit within Cloudflare's free plans: Workers Free
  (100,000 requests a day, 10 ms CPU per request), D1 Free (5 GB per account,
  500 MB per database, 5M row reads and 100k row writes a day), and the Zero
  Trust free plan for Access (up to 50 users). Signing up for Zero Trust asks
  for a card even on the free plan, but nothing is charged.
- **Cloudflare account.** Gideon has one standard Cloudflare account. Which
  domain Gideon owns, and whether its DNS is on Cloudflare, has not been checked
  yet: the connector available during design had no zone permissions. The
  app must also work on its free `*.workers.dev` address until the domain is
  sorted.
- **Phone first.** Every screen has to work well at phone width.
- **Currency:** Swiss francs (CHF) only, shown Swiss-style ("CHF 749.–", "CHF 19.90"). (Changed by Gideon after v1.)
- **Tools come from mise.** Every tool the project needs (Node, the `cf`
  CLI, the package manager) is pinned in the project's `mise.toml`, and
  nothing is installed globally. (Gideon's requirement; see 7.6.)

## 4. Approaches considered

| Approach | What it is | Why it was or wasn't picked |
|---|---|---|
| **marimo, exported to run in the browser** | marimo's WASM export, hosted as a free static site on Cloudflare | Rejected. Each visitor gets a private copy that runs in their own browser. What one flatmate enters never reaches the others and disappears on reload. The first load on phones is slow. |
| **marimo server (`marimo run`)** | A Python process serving the notebook as an app | Rejected. It needs an always-on Python server, and Cloudflare's free plan can't run one (Containers need the $5/month paid plan). Each visitor still gets a separate session, so shared storage would have to be built anyway. A notebook-style UI is weak on phones and for a future drag-and-drop floor plan. |
| **Custom web app on Cloudflare Workers + D1 + Access** | A small phone-first web app with a tiny API and one shared database, behind Cloudflare's login | **Picked by Gideon.** Free, shared data by default, works on phones, runs on Gideon's domain, and has room for the floor plan and AI import later. |

A shared Notion database was mentioned as a no-code fallback. It wasn't
pursued because it can't live on Gideon's domain or do the floor plan.

## 5. What Gideon decided

### 5.1 Items and ideas
- The moving list holds **items** (sofa, fridge, desk lamp).
- Each item can collect any number of **product ideas**. Each idea has a
  name, a link, a price, and notes.
- Exactly one idea per item can be starred as the **favorite**. The item's
  price is the favorite's price. Changing the favorite updates every total.
- An item can also have **its own price**, typed directly on the item or in
  the quick-add row, for simple things like "shower curtain, €19". Once an
  idea is starred, the favorite's price takes over. (Gideon picked this over
  auto-starring the first idea.)
- Wherever an own price is shown, it carries a **≈** sign (for example
  "≈ €19"), because it's only an estimate. Totals that include own prices
  don't show the sign.

### 5.2 Who an item is for
- Every item is either **for everyone** or **for one specific person**
  (for example, things for that person's own room).
- A shared item can still be paid for by just one person.
- **Personal items are private by default.** Each personal item has a
  "Show to everyone" checkbox, off by default. While it's off, only the
  person it belongs to can see the item, its ideas and its price.

### 5.3 Already owned
- Items someone already owns and brings along have their own status. They
  record whose they are and **have no price at all**: no own price, no
  ideas, no price paid. They count as zero everywhere.

### 5.4 Who paid
- The app records who paid for each item. It does not split costs or
  calculate who owes whom.
- After moving in, this turns the app into the flat's inventory.

### 5.5 Overview
- Per person: what they spend on their own things, what they spend on
  shared things, and the total.
- **No whole-flat total.** Gideon removed it from the overview.
- Shown with a chart.

### 5.6 Layout
- The moving list is **grouped by room** (mockup option B), with a subtotal
  per room. Tapping an item opens its own page, where it is edited.
  Gideon picked this over an editable spreadsheet-style table.
- Items without a room appear in their own **"No room"** block.
- There is a **screen to edit rooms**.

### 5.7 Later
- Paste a product link and have AI fill in the name, price and photo.
- **Smart add:** type an item name (for example "pan") and AI fills in the
  rest, such as the right room (kitchen). Maybe not v1.
- Rebuild the floor plan to plan out the rooms.

## 6. Calls made during design (not confirmed by Gideon)

These were proposed in the mockups and conversation. Gideon didn't object,
but none was explicitly confirmed. They should stay easy to change.

1. **Statuses:** needed → decided → bought, plus already owned.
2. **Starring a favorite** moves the item from *needed* to *decided*
   automatically. Removing the favorite moves it back to *needed*. *Bought*
   and *already owned* are only ever set by hand, and favorite changes don't
   affect them.
3. **Which price an item shows**, in this order:
   1. The price paid, if it's bought.
   2. Otherwise the favorite's price.
   3. Otherwise the item's own price, shown as "≈ €19".
   4. If there's none of those but it has ideas, the ideas' price range
      (for example "€150–260"). A range is not counted in any total.

   Typing an own price doesn't change the status; only starring a favorite
   does.
4. **Price actually paid:** when an item is marked bought, a "price paid"
   field appears, pre-filled with the favorite's price, because sales and
   delivery costs change the real price.
5. **"Paid by" can be set before buying,** so planned shared costs already
   count toward someone. For owned items the same field means "whose it is".
6. **Shared items with nobody set as payer** appear in the overview under
   "nobody set yet".
7. **Planned vs. actually spent:**
   - *Planned* adds up each item's price paid if it's bought, otherwise its
     favorite's price, otherwise its own price. Items with none of those,
     and owned items, count as zero.
   - *Actually spent* adds up the price paid of bought items only.
8. **Per-person numbers in the overview:**
   - *Own things* = items for that person, in whatever status counts for
     the selected view.
   - *Shared things they pay* = shared items where they are set as payer.
   - *Total* = the two added together.
   - A personal item's payer is always that person and can't be changed.
   - Everyone sees their own numbers in full. Another person's *own things*
     number only counts the personal items they've chosen to show, so
     hidden items never leak through totals.
9. **Rooms double as categories.** Rooms are editable on their own screen
   (add, rename, reorder, mark as shared or as one person's room, delete).
   Deleting a room moves its items to "No room"; it never deletes items.
10. **"For" has two choices: *Everyone* or *Just me*.** You can't create a
    personal item for someone else, which keeps privacy simple. New items
    added to your own room default to *Just me*; everywhere else they
    default to *Everyone*. A personal item can still sit in a shared room.
11. **Show to everyone:**
    - New personal items start hidden.
    - An item switched from *Everyone* to *Just me* starts with "Show to
      everyone" on, so it doesn't vanish from the others' screens without
      warning. Its owner can then switch it off.
    - Hiding is enforced by the server, not just the screen: other people's
      hidden items are never sent to their browsers.
12. **Rooms in the list:** a room block appears only when it has items the
    viewer can see (your own room always appears). "No room" sits at the
    end of the list.
13. **Filters** on the moving list: All, Shared, Mine, Still needed.
14. **Totals on the list:** each room block shows a subtotal (planned view)
    of the items the viewer can see.
15. **Overview chart:**
    - One horizontal bar per person, split into *own things* and *shared
      things they pay*, plus one bar for "nobody set yet".
    - A Planned / Actually spent switch sits above it.
    - Above the chart, tiles show the current viewer's own, shared and
      total numbers.
    - Colors follow a validated colorblind-safe palette. There is a legend,
      and the values are labeled on the bars.
16. **Quantity:** items have an optional quantity (default 1, for example
    four chairs). Idea prices and the item's own price are per unit, as
    shops list them; the field says "per piece" when the quantity is above
    1. The planned price is that unit price × quantity. "Price paid" is
    always the total actually paid, pre-filled with that product.
17. **Paid together:** besides one person or "not set", the payer can be
    "Together", for things the flat buys jointly. The app doesn't split
    these. They get their own "Paid together" bar in the overview and don't
    count toward anyone's personal numbers. This keeps "not decided yet"
    separate from "we bought it together" in the inventory.

Mockups of the room-grouped list, the item page with ideas, and the overview
were shown and are kept at
`.superpowers/brainstorm/56576-1795005113/content/screens-v1.html` (layout B
is the second card in section 1).

## 7. Technical shape (the builder's starting point)

These choices follow from the picked approach. The parts marked as the
builder's call are open.

### 7.1 Hosting and login
- One Cloudflare **Worker** serves both the front end (Workers Static
  Assets) and a small JSON API under `/api/*`.
- **D1** holds all data in one database.
- **Cloudflare Access** protects the whole hostname, API included.
  - Login is by one-time PIN sent to an allowlist of the flatmates' email
    addresses. Gideon maintains the allowlist in the Zero Trust dashboard.
  - The Worker identifies the current person from the Access JWT
    (`Cf-Access-Jwt-Assertion`), validated against the team's public keys.
    The email in it maps to a row in `people`.
  - An authenticated email with no matching `people` row gets a clear "not
    set up yet" message.
- **Hostname:** a subdomain of Gideon's domain (for example `wg.<domain>`)
  once the domain is confirmed. Until then, the `workers.dev` address, also
  behind Access.
- **Tooling:** create the project with the `cf` CLI (the Cloudflare skill's
  default for new projects). Use Wrangler only if `cf` can't do a step yet.
- **Who does the setup:**
  - The builder sets up `mise.toml`, which installs the `cf` CLI for this
    project only (see 7.6). The builder then runs `cf auth login`, and
    Gideon approves the request once in the browser. From then on the
    builder runs the create, migrate and deploy commands.
  - The first thing the builder does after signing in is list the
    account's domains, to settle the open domain question in section 9.
  - Gideon does the Zero Trust signup in the dashboard, because it
    asks for a card (not charged on the free plan), and picks the team name.
  - The builder then creates the Access application and policy with `cf` or
    the API if the sign-in grants that. Otherwise the builder hands Gideon a
    short click-by-click checklist.
  - The Worker needs the Access team domain and the application's audience
    tag (AUD) as configuration, so the Access app has to exist before
    end-to-end login can be tested. Local development runs without Access,
    using a fixed dev identity.

### 7.2 Data model (sketch)
Money is stored as integer cents.

- `people`: id, name, email (unique), sort order.
- `rooms`: id, name, `person_id` (null for shared rooms), sort order.
- `items`:
  - id, name, `room_id` (null = "No room")
  - `for_person_id` (null = for everyone; otherwise always the creator)
  - `visible_to_all` (boolean, default false; only matters for personal
    items). Every read query returns only items where `for_person_id` is
    null, equals the current person, or `visible_to_all` is true. The same
    rule applies to their ideas and to every total.
  - status (`needed` | `decided` | `bought` | `owned`)
  - payer: a person, "together", or not set. For owned items it means
    "whose it is". Representation is the builder's call (for example
    `payer_person_id` plus a `paid_together` flag).
  - `quantity` (integer, default 1)
  - `own_price_cents` (nullable, per unit; used only when there's no
    favorite)
  - `price_paid_cents` (set when bought)
  - notes, created_by, created_at, updated_at
- `ideas`:
  - id, item_id, title, url, shop (derived from the URL by default)
  - price_cents, image_url (optional, pasted), notes
  - is_favorite, created_by, created_at, updated_at
  - At most one favorite per item, enforced in the database (for example a
    partial unique index on `item_id` where `is_favorite = 1`). Starring an
    idea unstars the previous one in the same transaction.
- The item's displayed price, its range, and all totals are **computed**,
  not stored, so they can never drift from the ideas.

### 7.3 Screens
1. **Moving list:** rooms as blocks with subtotals, with "No room" last.
   Items appear as rows showing name, who it's for, idea count, payer,
   status and price; hidden personal items show a small "only you" marker.
   Filter chips sit on top. "Add item" works in one step from the list:
   only the name is required, and the room and price are optional.
2. **Item page:**
   - Editable fields: name, room (or none), who it's for, "show to
     everyone" (personal items only), quantity, own price (greyed out with
     a note while a favorite is starred), status, paid by, price paid
     (shown when bought), notes.
   - When the status is *already owned*, the price fields and the ideas
     section are hidden. Any ideas the item had stay saved and come back if
     the status changes again.
   - The ideas list, with a star to pick the favorite, plus add, edit and
     delete.
   - An "add idea" box that accepts a pasted link first, then name and
     price. In the first version, name and price are typed by hand.
3. **Overview:** as described in section 6, item 15.
4. **Rooms:**
   - A list of rooms you can reorder by dragging (or with up/down buttons
     on phones).
   - Each room has a name and is either shared or one person's room.
   - Add and delete. Deleting asks first and moves the room's items to "No
     room".
5. **People** (small): names and emails of the flatmates. Anyone logged in
   can edit rooms and people, since everyone is trusted.

### 7.4 Working together
- Everyone can edit everything; no roles.
- No live updates. The app refetches when the tab regains focus and after
  every change. If two people edit the same field at once, the last save
  wins.
- Deleting an item also deletes its ideas, after a confirmation.

### 7.5 Backups
- D1 Time Travel is always on: it can restore to any minute within the last
  7 days on the free plan. That's enough for v1.
- A one-click CSV/JSON export is nice to have, not required.

### 7.6 Toolchain: mise
- A `mise.toml` at the project root pins every tool:
  - `node = "24"`: `cf` needs Node 22.18 or later.
  - `"npm:cf"`: Cloudflare's CLI, through mise's npm backend, version
    pinned. 0.15 is current as of 2026-11-18. It's never installed with
    `npm install --global`.
  - The package manager, if it isn't the npm that comes with Node.
- Everyday commands are mise tasks, so nobody has to remember the
  underlying commands. For example: `mise run dev` (local app with a local
  D1), `mise run db:migrate` (local), `mise run db:migrate:remote`, and
  `mise run deploy`.
- Getting started on a fresh machine is `mise install`, then
  `npm install`.
- Wrangler is not a project dependency. The few commands `cf` doesn't
  support yet, like live logs, run through `npx wrangler` as the `cf`
  docs describe.

### 7.7 Left to the builder
- Front-end framework and component library. Requirements: phone first,
  quick to load, and able to host a drag-and-drop SVG floor plan later.
  React + Vite with the Cloudflare Vite plugin is a sensible default.
- API framework inside the Worker (for example Hono) and how queries are
  written.
- Exact visual design, within the mockups' structure.
- Whether ideas get optional width/depth fields now, to feed the floor plan
  later.
- Seed data: a default room list (kitchen, living room, bathroom, hallway,
  one room per person).

## 8. Later features (not in v1, but don't block them)

- **AI import from a link:** paste a product URL and a Worker fetches the
  page and extracts name, price and image. Candidates are Workers AI, or the
  Claude API with Cloudflare's browser rendering for pages that need
  JavaScript. Free-tier limits must be checked before building. The ideas
  table already has the fields this would fill.
- **Smart add:** when someone types a new item's name, AI suggests the
  room and other fields (for example "pan" → kitchen, for everyone). The
  suggestion is pre-filled but stays editable. Workers AI's free daily
  allowance is a likely fit, but check it before building. Making the room
  optional in v1 (the "No room" block) keeps this a pure add-on.
- **Floor plan:** draw the flat to scale and drag furniture (linked to items
  and their favorite ideas) into rooms. It's a separate screen in the same
  app, with its own tables for walls and placed objects.
- **Live updates**, if refetching on focus turns out to be annoying:
  Durable Objects (which have a free tier) could push changes over
  WebSockets.

## 9. Open items outside the design

- Confirm Gideon's domain and whether its DNS is on Cloudflare. On the free
  plan, a Worker on `wg.<domain>` needs the whole domain's nameservers on
  Cloudflare; a CNAME-only setup needs a paid plan. If the domain lives
  elsewhere, moving it means copying its existing DNS records first, so
  any email or website it serves keeps working.
- Gideon needs to provide the flatmates' names and email addresses for the
  allowlist and the `people` table.
