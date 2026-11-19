# AI link import and smart room suggestions: evaluation and plan

Date: 2026-11-19. Status: **proposal, not implemented**, waiting for Gideon's go.
Constraint: stays free (Workers Free plan). Gideon's spending limit makes anything paid stop instead of bill.

## What we want
1. **Link import:** paste a product link (on the Ideas tab or in the item modal) and the app fills in the **title, price, shop and photo**.
2. **Smart add / categorisation:** type an item name ("Pfanne", "Duschvorhang") and the app suggests the **right room**.

## The building blocks on Cloudflare (checked against the docs, Nov 2026)

| Piece | What it gives us | Free plan | Fit |
|---|---|---|---|
| **Worker `fetch()` + `HTMLRewriter`** | Downloads the product page and streams through the HTML to pick out tags | Counts as ordinary requests (100k/day) | **Main path.** Free, fast, no AI needed for most shops |
| **Structured data in the page** (JSON-LD `schema.org/Product`, OpenGraph `og:*`, microdata `itemprop=price`) | Title, price, currency and image, as machine-readable data shops publish for Google | – | **Most reliable source.** Big shops publish it |
| **Workers AI (an LLM)** | Reads the page text and returns JSON (title, price, currency, image) when there's no structured data. Also suggests rooms | **10,000 neurons/day**, then it fails (no bill) | **Fallback for extraction, main tool for room suggestions** |
| **Browser Run** (headless Chrome; `/json` reads a page with AI) | Renders JavaScript-heavy pages, sometimes gets past simple bot walls | **10 min/day, 1 request every 10 s** | **Optional last fallback.** Its `/json` defaults to a 70B model, which is expensive in neurons, so only use `/content` or `/markdown` from it |
| **Vectorize + embeddings** | Similarity search ("Pfanne" is close to items you put in the Kitchen) | Free tier exists; embeddings cost almost nothing | **Not needed at our size.** See "Categorisation" |
| **R2** | Storing images ourselves instead of linking to the shop's | 10 GB free | **Later**, only if shop images break |

## How the scraping works (recommended pipeline)
For each pasted link (`POST /api/ideas/preview {url}`):
1. **Validate the URL:** http/https only, not our own domain, at most 3 redirects, 8 s timeout, read at most about 1.5 MB.
2. **Cache:** if the same URL was looked up in the last 7 days, return that result (stored in D1).
3. **Fetch** with a normal browser User-Agent and `Accept-Language: de-CH`.
4. **Structured data first** (HTMLRewriter, no AI):
   - JSON-LD `Product` / `Offer`: `name`, `offers.price`, `priceCurrency`, `image`.
   - Otherwise OpenGraph: `og:title`, `og:image`, `product:price:amount` / `:currency`.
   - Otherwise microdata `itemprop`.
5. **If the price or title is still missing:** reduce the page to its visible text (drop scripts, nav and footer; at most ~6,000 tokens) and ask the LLM for JSON matching a fixed schema `{title, price, currency, imageUrl}`, validated with zod. One retry if the JSON is invalid.
6. **(Optional, phase 3)** If the fetch was blocked (403, a challenge page) or the page is empty without JavaScript: Browser Run `/content`, then steps 4–5 again.
7. **Return** `{title, priceCents, currency, imageUrl, shop, source: "structured" | "ai" | "browser" | "none"}`. **Nothing is saved automatically.** The form fields fill in, and you check and save.

Why this order: structured data is exact and costs nothing. The AI is only for shops without it. A browser is slow and limited to 10 min/day, so it's only for the rest.

**Honest expectations:**
- Swiss and German shops that publish JSON-LD (IKEA, Interio, Micasa, Pfister, Conforama, Brack, most Shopify shops) should work without AI.
- Shops with strong bot protection (Galaxus/Digitec in particular, sometimes Amazon) may block the Worker and even Browser Run.
- In that case the idea is still saved with the link and the domain as the title, and you type the price, exactly as today. **Phase 0 measures this on real links before we commit.**

## Which model (small enough, good enough, free)
Prices are from the Workers AI pricing page. Free means 10,000 neurons per day.

| Model | Type | Neurons per 1M tokens, input / output | One extraction (~6k in, 300 out) | Notes |
|---|---|---|---|---|
| **@cf/google/gemma-4-26b-a4b-it** | Mixture-of-experts, 26B total / **4B active** | 9,091 / 27,273 | **≈ 63 neurons → ~150 pages/day free** | **Recommended.** Fast like a 4B model, strong at German, 256k context, zero data retention, available on Free |
| @cf/qwen/qwen3-30b-a3b-fp8 | Mixture-of-experts, 3B active | 4,625 / 30,475 | ≈ 37 neurons | Cheapest good alternative; the fallback model |
| @cf/zai-org/glm-4.7-flash | multilingual, reasoning | 5,500 / 36,400 | ≈ 40+ (reasoning tokens can add more) | Fine, but reasoning output makes cost unpredictable |
| @cf/ibm-granite/granite-4.0-h-micro | tiny | 1,542 / 10,158 | ≈ 12 | Cheapest, but weaker at messy shop pages; maybe enough for room suggestions |
| @cf/meta/llama-3.3-70b (Browser Run `/json` default) | 70B | expensive | – | **Avoid.** Too costly for the free allowance |

A room suggestion is a tiny prompt (item name plus room list, ~150 tokens) and costs **about 2 neurons**. That's effectively free even with gemma-4.
Phase 0 confirms that gemma-4 follows the JSON schema reliably via `response_format`. If not, use qwen3-30b-a3b.

## Categorisation ("jev")
I read "jev" as vector embeddings, for example Vectorize. **If you meant something else, tell me.**

| Approach | How | Verdict |
|---|---|---|
| **LLM picks a room** (recommended) | Send the item name and your room names; get back `{roomId, confidence}` as JSON | Works from day one, even with empty rooms ("Pfanne" → Kitchen), handles German and English, costs ~2 neurons |
| Embeddings, nearest neighbour | Embed the item name, compare with room names and items already in each room (`embeddinggemma-2`, nearly free), all computable in the Worker | Learns your habits over time, but is weak while rooms are empty. Vectorize is overkill for under 1,000 items |
| Hybrid | Embeddings when there are enough items, LLM otherwise | More code for little gain at WG scale. **Later**, if suggestions feel generic |

**UX:**
- **Quick add:** after you stop typing a name (~600 ms, at least 3 characters) and you haven't picked a room yet, the room dropdown pre-selects the suggestion with a small "✨ suggested" label. You can always change it, and a room you've picked yourself is never overwritten.
- **"Make item":** the same suggestion is used on the Ideas tab.

## Safety, privacy and limits
- **Fetching arbitrary URLs:** Workers can't reach private networks. On top of that: only http(s), no own domain, size and time limits, at most 3 redirects.
- **Prompt injection from shop pages:** the model only fills in fields. It has no tools, its output is validated by a schema, and nothing is saved without you.
- **Privacy:** only the URL and the page text go to Workers AI, and gemma-4 is a zero-data-retention model. Nothing about you or your flat goes along. For room suggestions, the room names and the item name.
- **Limits:**
  - Per person, 40 link previews and 200 room suggestions per day (D1 counter), plus the 7-day URL cache.
  - When the free daily allowance runs out, Workers AI fails. The app then shows "Couldn't read this page automatically" and falls back to manual entry. **There is no way to get billed.**

## Phases
0. **Spike (throwaway), ~½ day:** run the pipeline locally against ~15 real links (IKEA CH, Galaxus, Digitec, Interio, Micasa, Pfister, Conforama, Brack, Coop Bau+Hobby, Jumbo, Ricardo, Tutti, Amazon.de, a Shopify shop, a small shop).
   - Record per link: fetch OK or blocked, structured data present, AI result quality, neurons used.
   - Also test gemma-4 against qwen3 on JSON reliability and German.
   - Result: a table, and go/no-go for each phase.
1. **Link import:**
   - `POST /api/ideas/preview`, the structured-data parser (unit tests on saved HTML fixtures), the AI fallback, caching and rate limits.
   - In the UI: pasting a link into Ideas quick capture or the modal's "Add idea" fills title, price, shop and image with a small spinner and a "filled automatically, please check" hint. Prices in another currency are **shown but not filled in** ("found EUR 129, please enter in CHF").
2. **Smart room suggestion:** `POST /api/rooms/suggest {name}` plus the quick-add and make-item UX above.
3. **Optional:** the Browser Run fallback for blocked or JavaScript pages, but only if phase 0 shows real gains. Image copies in R2 only if images break.

Setup needed:
- An `AI` binding (and `BROWSER` for phase 3) in `cloudflare.config.ts`.
- Local dev uses remote AI, because Workers AI doesn't run locally, so `cf dev` needs the existing Cloudflare login.
- In CI, the API token needs **Workers AI: Read** (and Browser Run for phase 3) added.

## Decisions I'd make (please verify)
1. **Structured data first, AI only as a fallback, browser last** (or never). Cost and reliability.
2. **Model: gemma-4-26b-a4b-it, with qwen3-30b-a3b as the fallback.** Final choice after phase 0.
3. **Room suggestions use the LLM, not embeddings or Vectorize.** Revisit if suggestions feel generic.
4. **Nothing is saved automatically.** Import only fills the form; you confirm.
5. **Other currencies are shown, not converted.**
6. **Images stay links to the shop** (no R2) for now.
7. **Rate limits:** 40 previews and 200 suggestions per person per day, plus a 7-day URL cache.
8. **Start with phase 0** and report results before building phases 1 and 2.
