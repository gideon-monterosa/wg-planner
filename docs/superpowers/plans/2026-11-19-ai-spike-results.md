# AI link import and room suggestions: phase 0 spike results

Date: 2026-11-19. Status: **spike done, throwaway code not committed**.
Belongs to `2026-11-19-ai-link-import-plan.md` (phase 0).

## TL;DR

- **Plain fetch from a Worker gets real product data from only 6 of 19 shop URLs.** IKEA, Micasa and Pfister work, and so do two Shopify shops; Amazon.de half-works. Galaxus, Digitec, Conforama, Brack, Coop Bau+Hobby, Jumbo, Ricardo, Tutti and a small Shopify shop block Cloudflare's egress (403, 429, 520 or 530, or a challenge or captcha).
- **Every unblocked product page had complete JSON-LD**, except Amazon. The structured parser is the right main path, and the AI fallback is rarely needed.
- **Browser Run `/content` gets past Conforama's and Brack's blocks.** Both then have complete JSON-LD. It doesn't get past Galaxus, which still shows a captcha.
- **Both models return valid JSON via `response_format: json_schema`.** gemma-4 does so only with thinking turned off. With thinking on (the default), it spends the whole token budget on reasoning and returns empty content.
- **Room suggestions work:** gemma 20/20, qwen 19/20 against my judgement. They cost about 1.0 to 1.5 neurons each.
- **Spend:** about **725 neurons** in total (budget 4,000), and Browser Run **4 calls, about 21 s** of wall time (budget about 10 calls).

| Phase | Verdict |
|---|---|
| 1 Link import | **Go, with narrower expectations.** Structured data covers the shops that let us in. Treat "blocked" as normal: save the link plus the domain, and let the person type the rest. |
| 2 Room suggestions | **Go.** Cheap, fast and accurate. Handle personal rooms specially (see below). |
| 3 Browser Run fallback | **Go, limited.** It recovered 2 of the 3 blocked shops it was tried on (not Galaxus). Use it only after a block status, at most about 50 calls per day, and keep it optional and behind a flag. |

**Model choice:** **gemma-4-26b-a4b-it with `chat_template_kwargs.enable_thinking: false`** for extraction (more accurate on prices). Either model works for room suggestions; **qwen3-30b-a3b-fp8** is about 4x faster there (details below).

## Method

- **Where the fetches ran:** on Cloudflare's network, never locally, so the corporate proxy played no part and no result shows its "Access Denied" page.
  - `cf dev` (1.0 RC) has no remote mode; it starts the local Vite dev server.
  - `cf previews deploy` would create a preview URL, so I didn't use it.
  - Instead I used option (b): a **temporary Worker `wg-planner-spike`** (`workersDev: false`, `previewUrls: false`, no routes or domains; `cf workers get` confirmed `subdomain.enabled: false`). It had a temporary KV namespace for results and an `AI` binding.
- **How the Worker was invoked:**
  - The first 16 fetches ran from a cron trigger. It took about 15 minutes before it first fired.
  - Everything after that ran through a **Workflow** started with `cf workflows instances create … --location-hint weur`. Those requests ran in the **AMS** colo.
  - Results were read back with `cf kv keys get`.
- **Fetch:** Chrome 131 User-Agent, `Accept-Language: de-CH`, follow redirects, 8 s timeout, body capped at 1.5 MB, as in the plan.
- **Parser:** regex over the HTML, in this order:
  1. JSON-LD `Product` / `ProductGroup`, including `@graph`, `offers` arrays and `AggregateOffer`
  2. OpenGraph and `product:price:*`
  3. microdata `itemprop`
- **Visible text** for the AI:
  - Drops script, style, head, nav and footer, capped at 18,000 characters (about 2–6.5k tokens actually sent).
  - Includes the HTML title and up to 8 image URLs.
- **AI:**
  - Called from the Worker via `env.AI.run`, `temperature: 0`, `max_tokens: 400` (60 for rooms).
  - `response_format: {type: "json_schema", json_schema: {name, schema, strict: true}}`.
  - Neurons come from `usage.neurons` in each response; Workers AI returns them.
  - The jobs ran one after another. The latencies are wall-clock times seen by the Worker.
- **Browser Run:** `cf browser-run quick-action content --url …` (REST, runs on Cloudflare). Its HTML was put through the same parser locally.
- **Cleanup:** the Worker, the Workflow and the KV namespace were deleted after the run. The `wg-planner`, `wg-planner-int` and jass-tracker Workers were not touched.

## 1. Product page extraction (plain Worker fetch)

| Shop | HTTP | Size | Blocked / challenge | JSON-LD Product | OG | Microdata | Parsed title | Price | Cur | Image |
|---|---|---|---|---|---|---|---|---|---|---|
| IKEA CH | 200 | 1,099 KB | no | yes | title, image | no | LACK Wandregal - weiß 30x26 cm | 6.95 | CHF | yes |
| Galaxus | 403 | 69 KB | yes, "Access denied" (own WAF) | – | – | – | – | – | – | – |
| Digitec | 403 | 69 KB | yes, "Access denied" (same as Galaxus) | – | – | – | – | – | – | – |
| Interio | 200 | 32 KB | no, but **redirects to migros.ch** (Interio has closed) | no | image only | no | – | – | – | (favicon) |
| Micasa | 200 | 1,175 KB | no | yes | title, image, price | no | MIRANDA Stehleuchte | 153.30 | CHF | yes |
| Pfister | 200 | 887 KB | no | yes | title, image | no | Sofa 2-Sitzer Cosy1 | 1899 | CHF | yes |
| Conforama CH | 403 | 6 KB | yes, Cloudflare challenge ("Just a moment…") | – | – | – | – | – | – | – |
| Brack | 520 | 0 KB | yes: `error code: 520` on 2 different products | – | – | – | – | – | – | – |
| Coop Bau+Hobby | 530 | 0 KB | yes: `error code: 530` | – | – | – | – | – | – | – |
| Jumbo | 403 | 1 KB | yes, DataDome, and redirects to the supercard.ch login | – | – | – | – | – | – | – |
| Ricardo | 403 | 1,381 KB | yes, "Ricardo Captcha" (Cloudflare challenge) | – | – | – | – | – | – | – |
| Tutti | 403 | 240 KB | yes, "Security check" (Cloudflare challenge) | – | – | – | – | – | – | – |
| Amazon.de | 200 | 1,468 KB (**hit the 1.5 MB cap**) | no | no | no | no | – (HTML title only) | – | – | – |
| Kleine Wolke (Shopify, DE) | 200 | 1,119 KB | no | yes | title, image, price | no | Shower curtain Textile GIN Black-White … | 14.99 | EUR | yes |
| Tiptoe (Shopify, FR, CH store) | 200 | 743 KB | no | yes | title, image, price | no | EASY sofa - 2 seats | 2677 | CHF | yes |
| KAQTU (small CH Shopify shop) | 429 | 9 KB | yes, Cloudflare "Verifying your connection" | – | – | – | – | – | – | – |
| byFlou (small DK/CH shop) | 200 | 814 KB | no, but **geo-redirects to the Danish homepage** | no | site title, image | no | (homepage) | – | – | – |
| KARE CH | 404 | 397 KB | no, the product URL is gone | – | – | – | – | – | – | – |

Size is the size of the response body.

**Summary:**
- **Product data from a plain fetch:** 6 of 19 URLs: IKEA, Micasa, Pfister, 2 Shopify shops, and Amazon through the AI.
- **Blocked:** 10 URLs from 9 shops. Brack failed on both of its URLs.
- **Gone or redirected:** 3 (Interio, KARE, byFlou).

Where the page came through, JSON-LD was complete (title, price, currency, image) every time, except on Amazon. Microdata never added anything. Fetch latency was 1.3–3.1 s for real pages; blocked pages answered in under 100 ms. The regex parser on 0.7–1.5 MB pages raised no CPU-limit errors on the Free plan.

## 2. AI fallback (Workers AI)

Pages:
- Amazon, the only real page without structured data.
- IKEA, Micasa, Pfister and Tiptoe, as controls with known JSON-LD.

Both models use `json_schema` mode, gemma with thinking off.

| Page | Model | Valid JSON | Latency | Tokens in / out | Neurons | Title | Price | Cur | Image | Correct? |
|---|---|---|---|---|---|---|---|---|---|---|
| Amazon | gemma-4 | yes | 4,848 ms | 6,413 / 129 | 61.8 | DUFU Wasserdichter Duschvorhang … | 87.96 | HKD | yes | matches the page (the page itself shows HKD, see Risks) |
| Amazon | qwen3 | yes | 759 ms | 6,439 / 83 | 32.3 | same | 87.96 | HKD | yes | matches the page |
| IKEA | gemma-4 | yes | 3,542 ms | 2,291 / 87 | 23.2 | LACK Wandregal, weiss, 30x26 cm | 6.95 | CHF | yes | yes |
| IKEA | qwen3 | yes | 488 ms | 2,341 / 76 | 13.1 | same | 6.95 | CHF | yes | yes |
| Micasa | gemma-4 | yes | 3,953 ms | 3,334 / 122 | 33.6 | MIRANDA Stehleuchte silberfarbig … | 153.30 | CHF | yes | yes |
| Micasa | qwen3 | yes | 958 ms | 3,515 / 108 | 19.5 | MIRANDA Stehleuchte | 153.30 | CHF | yes | yes |
| Pfister | gemma-4 | yes | 1,442 ms | 1,971 / 75 | 20.0 | sensoo Sofa 2-Sitzer Cosy1 … | 1899 | CHF | yes | yes |
| Pfister | qwen3 | yes | 448 ms | 2,038 / 70 | 11.6 | sensoo Sofa 2-Sitzer Cosy1 | **1614.05** | CHF | yes | **no**: picked the "Member Preis", while the regular price is 1,899 |
| Tiptoe | gemma-4 | yes | 2,348 ms | 4,399 / 121 | 43.3 | EASY sofa - 2 seats | 2677 | CHF | yes | yes |
| Tiptoe | qwen3 | yes | 850 ms | 4,175 / 113 | 22.8 | 2-seater sofa EASY … – Tiptoe | 2677 | CHF | yes | yes (title includes the shop name) |

- **Accuracy:**
  - gemma-4: 5 of 5 correct.
  - qwen3: 4 of 5. It took the member price at Pfister.
- **Latency and cost per extraction:**
  - gemma-4: median about 3.5 s, about 36 neurons.
  - qwen3: median about 0.76 s, about 20 neurons.

  At about 36 neurons per page, gemma allows roughly 270 extractions per day for free.
- **gemma-4 with thinking on (the default):** in the first run, all 5 extractions and all 20 room calls ended with `finish_reason: length`. All the tokens went to `reasoning_content` and the content was empty. IKEA took 10.9 s and 31.7 neurons for nothing. Thinking **must** be turned off with `chat_template_kwargs: {enable_thinking: false}`.
- **qwen3:** gets `/no_think` appended to the prompt; that was enough.

## 3. Browser Run (`/content`)

| Shop | Plain fetch | Browser Run result | Parse after Browser Run | Helps? |
|---|---|---|---|---|
| Galaxus | 403 Access denied | 16 KB page that loads `captcha-*.js`, no content | nothing | **no** |
| Conforama | 403 Cloudflare challenge | 952 KB real page | JSON-LD: "Schreibtisch HOME-OFFICE", 212.45 CHF, image | **yes** |
| Brack (product 1439958) | 520 | 879 KB, but redirects to a **search page** (product delisted) | search OG image only | reached the site, wrong URL |
| Brack (product 1744980, retry) | 520 | 351 KB real page | JSON-LD: "Stehleuchte Textil «TESSILE» Weiss", 59.95 CHF; OG image | **yes** |

- **Calls:** 4 in total. That's one more than planned, because the first Brack URL turned out to be delisted.
- **Wall time:** 4–6 s per call, about 21 s in all. The CLI doesn't show `X-Browser-Ms-Used`, so this is an upper bound on browser time.
- **Outcome:** Browser Run recovers shops whose block targets the Worker's egress or a simple Cloudflare challenge (Conforama, Brack). It doesn't recover Galaxus or Digitec, which have their own captcha.
- **Not tried:** Ricardo, Tutti, Jumbo, Coop and KAQTU, to stay within budget. Coop's 530 and KAQTU's challenge look like the Brack and Conforama cases, so Browser Run might recover them. Ricardo, Tutti and Jumbo (DataDome) are less likely.

## 4. Room suggestions

- **Rooms:** Küche, Wohnzimmer, Bad, Gang, Balkon, Gideons Zimmer, Lenas Zimmer.
- **Output:** JSON `{room (enum of the rooms), confidence}` via `json_schema`, with gemma's thinking off.

| Item | Acceptable (my judgement) | gemma-4 | conf | ms | qwen3 | conf | ms |
|---|---|---|---|---|---|---|---|
| Pfanne | Küche | Küche | 1.0 | 785 | Küche | 1.0 | 154 |
| Duschvorhang | Bad | Bad | 1.0 | 1,873 | Bad | 1.0 | 295 |
| Sofa | Wohnzimmer | Wohnzimmer | 1.0 | 861 | Wohnzimmer | 1.0 | 168 |
| Schreibtischlampe | a personal room | Gideons Zimmer | 0.5 | 479 | Gideons Zimmer | 0.95 | 216 |
| Wäscheständer | Balkon / Bad / Gang | Bad | 0.7 | 1,577 | Balkon | 0.95 | 200 |
| Pflanze | Wohnzimmer / Balkon | Wohnzimmer | 0.7 | 945 | Balkon | 0.9 | 267 |
| Router | Wohnzimmer / Gang | Wohnzimmer | 0.8 | 692 | Wohnzimmer | 0.9 | 198 |
| Bettdecke | a personal room | Gideons Zimmer | 0.5 | 752 | Gideons Zimmer | 1.0 | 235 |
| Mixer | Küche | Küche | 1.0 | 1,173 | Küche | 0.95 | 358 |
| Garderobe | Gang | Gang | 0.9 | 705 | Gang | 0.9 | 331 |
| Spiegel | Bad / Gang | Bad | 0.9 | 4,685 | Bad | 0.95 | 376 |
| Teppich | Wohnzimmer | Wohnzimmer | 0.8 | 752 | Wohnzimmer | 0.9 | 271 |
| WLAN-Verstärker | Gang / Wohnzimmer | Wohnzimmer | 0.8 | 1,229 | Wohnzimmer | 0.9 | 255 |
| Toaster | Küche | Küche | 1.0 | 1,215 | Küche | 1.0 | 221 |
| Kleiderbügel | a personal room / Gang | Gideons Zimmer | 0.7 | 1,065 | **Küche ✗** | 0.3 | 158 |
| Stehlampe | Wohnzimmer | Wohnzimmer | 0.9 | 1,429 | Wohnzimmer | 0.9 | 312 |
| Fussmatte | Gang | Gang | 0.9 | 790 | Gang | 0.9 | 286 |
| Abfalleimer | Küche | Küche | 0.9 | 510 | Küche | 0.95 | 163 |
| standing desk | a personal room | Gideons Zimmer | 0.5 | 703 | Gideons Zimmer | 0.9 | 233 |
| bike pump | Gang / Balkon | Gang | 0.8 | 429 | Gang | 0.9 | 203 |

| | gemma-4 | qwen3 |
|---|---|---|
| Correct | **20/20** | 19/20 |
| Median latency | 861 ms | **235 ms** |
| Neurons per call | about 1.3 | about 1.1 |
| JSON valid | 20/20 | 20/20 |

- **Personal items always go to "Gideons Zimmer"** with both models. That's the first personal room in the list; neither model can know whose item it is.
  - gemma signals this with confidence 0.5. qwen reports 0.9–1.0, so its confidence isn't informative.
  - Phase 2 should not trust the model for personal rooms. If the suggestion is a personal room, either pick the current person's own room or leave the dropdown empty and suggest "a personal room".
  - Alternatively, send the rooms as "personal" versus "shared" and map the result in code.
- **qwen also failed on English input with low confidence** (Kleiderbügel → Küche, 0.3). A confidence threshold of about 0.6 would have hidden that one.

## Usage

| Item | Neurons |
|---|---|
| Run 1 (bugs: gemma thinking on, subrequest limit), extraction | 322 |
| Run 1, rooms | 73 |
| Run 2, extraction (10 calls) | 281 |
| Run 2, rooms (40 calls) | 48 |
| **Total** | **≈ 725** (of the 4,000 budget, of 10,000/day) |

Browser Run: **4 requests, at most about 21 s** (of 10 min/day).

## Recommendation per phase

**Phase 1, link import: go.**
- Build the plan's pipeline as designed: structured data first, AI only when it's missing.
- Expect about a third of Swiss shop links to work automatically from a Worker: IKEA, Micasa, Pfister and Shopify shops.
- Galaxus and Digitec, the shops Gideon probably uses most, will **not** work, nor will Ricardo, Tutti, Jumbo and some Cloudflare-protected shops.
- The "blocked → save the link with the domain as the title, the person types the price" path is the common case, not an edge case. Design the UI for it: a clear "Couldn't read this shop automatically" message, no error styling.
- Treat a 520 or 530 from a shop on Cloudflare as "blocked", not as "shop down".

**Phase 2, room suggestions: go.** About 1 neuron per call and under 1 s, with high accuracy on shared rooms. Add the personal-room rule above and a confidence threshold.

**Phase 3, Browser Run fallback: go, limited.**
- It turned 2 of the 3 blocked shops it was tried on (Conforama, Brack) into complete JSON-LD results, at about 5 s each.
- Use it only after a block status (403, 429, 520, 530, or a challenge marker), not for empty pages.
- Cap it at well under the 10 min/day limit (for example 50 calls per day across the WG), and cache results for 7 days.
- Expect Galaxus and Digitec to stay blocked. Phase 3 can come after phase 1 ships, but it adds real coverage.

## Model choice

- **Extraction:** `@cf/google/gemma-4-26b-a4b-it` with `chat_template_kwargs: {enable_thinking: false}` and `response_format: json_schema` (strict). In this small sample it was the more accurate model: it picked the regular price over a member price.
  - Its latency (1.4–4.8 s) is fine behind a spinner, and it costs about 36 neurons per page.
  - Fall back to `@cf/qwen/qwen3-30b-a3b-fp8` if gemma errors.
- **Room suggestions:** either model. qwen3 is about 4x faster (235 ms versus 860 ms median), which matters for the "pre-select while typing" UX. gemma's confidence is more honest.
  - Recommendation: **qwen3 for room suggestions**, combined with the personal-room rule and a confidence threshold. Or use gemma for everything if one model is simpler; 860 ms after a 600 ms debounce is acceptable.

## Surprises and risks

1. **gemma-4 thinks by default.** Without `enable_thinking: false`, JSON mode returns empty content with `finish_reason: length`, still costs neurons, and takes about 10 s. JSON mode itself works once thinking is off (10/10 extractions, 20/20 rooms valid).
2. **Shops are behind Cloudflare and block Workers.**
   - Brack returns 520 and Coop Bau+Hobby 530 to Worker subrequests.
   - Conforama, Ricardo, Tutti and KAQTU serve Cloudflare challenges.
   - Galaxus and Digitec have their own WAF ("Access denied").
   - Jumbo uses DataDome and redirects to its login.
   - Nothing about the User-Agent can fix this from a Worker.
3. **Geolocation of Cloudflare egress is wrong for Swiss shops.**
   - **Amazon.de showed prices in HKD** (87.96 HKD, "Lieferung für 106,86 HKD") to the Worker in AMS.
   - byFlou redirected to its Danish homepage.

   Plan for it: a currency other than CHF is "shown, not filled", as the plan already says, and an Amazon price is unreliable.
4. **Amazon pages are larger than the 1.5 MB cap.** The price was still inside the first 1.5 MB, but this is fragile. Keep the cap, and consider stopping early once `</head>` plus the buybox has been seen.
5. **Member and sale prices.** Pfister's JSON-LD has the regular price (1,899), and the page also shows a "Member Preis" (1,614.05). Micasa showed a discounted price (153.30) where earlier listings said 219. Conforama via Browser Run showed 212.45. "Price" means whatever the shop publishes as the offer price today; the form should make it easy to edit.
6. **Interio has closed** (it redirects to migros.ch), and some search-result product URLs were already 404 (KARE) or delisted (Brack). Stale links are common; return `source: "none"` gracefully.
7. **Workers AI returns `usage.neurons` directly** in each response. Phase 1 can count the daily budget exactly instead of estimating.
8. **Free-plan Worker limits:**
   - A workflow step hit "Too many subrequests" once 50 parallel AI steps shared one invocation. That doesn't apply to the real per-request endpoint, but keep AI and retry calls per request small.
   - No CPU-limit errors parsing 1.5 MB HTML with regex.
9. **Cron triggers on a new Worker took about 15 minutes to fire** (spike tooling only; not relevant to the feature).

## Not covered

- The **Galaxus or Digitec API**, or their affiliate feeds, might be the only reliable way to import from them. Not explored.
- Browser Run on Ricardo, Tutti, Jumbo, Coop and KAQTU (budget).
- More than one product per shop, except Brack. Results per shop might vary by product type.
