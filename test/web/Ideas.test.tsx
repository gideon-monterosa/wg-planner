import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { IdeaWithItem, ItemSummary, Room } from "../../src/shared/types";
import Ideas from "../../src/web/pages/Ideas";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ROOMS: Room[] = [
  { id: 1, name: "Kitchen", personId: null, sort: 1 },
  { id: 2, name: "Gideon", personId: 1, sort: 2 },
];
const summary = (over: Partial<ItemSummary>): ItemSummary => ({
  id: 0, name: "", roomId: null, forPersonId: null, visibleToAll: false, status: "needed", payer: { kind: "none" },
  quantity: 1, ideaCount: 0, price: { kind: "none" }, plannedCents: 0, spentCents: 0, canEdit: true, ...over,
});
const ITEMS: ItemSummary[] = [
  summary({ id: 5, name: "Pan", roomId: 1 }),
  summary({ id: 6, name: "Bed", roomId: null, forPersonId: 1 }),
  summary({ id: 7, name: "Desk", roomId: null, forPersonId: 2, canEdit: false, visibleToAll: true }),
];
const base = (over: Partial<IdeaWithItem>): IdeaWithItem => ({
  id: 0, title: "", url: "", shop: "", priceCents: null, imageUrl: "", notes: "", isFavorite: false,
  itemId: null, itemName: null, roomId: null, itemStatus: null, itemForPersonId: null, itemVisibleToAll: null,
  canEdit: true, canEditItem: false, isMine: true, ...over,
});
const UNLINKED = base({ id: 1, title: "Lamp", url: "https://shop.example/lamp", shop: "shop.example", priceCents: 4990 });
const ON_PAN = base({ id: 2, title: "Steel pan", itemId: 5, itemName: "Pan", roomId: 1, itemStatus: "needed", itemVisibleToAll: false, canEditItem: true });
const ON_DESK = base({
  id: 3, title: "Oak desk", itemId: 7, itemName: "Desk", itemStatus: "needed", itemForPersonId: 2, itemVisibleToAll: true,
  canEdit: false, canEditItem: false, isMine: false,
});
const IDEAS = [UNLINKED, ON_PAN, ON_DESK];

type Call = { method: string; path: string; body?: unknown };

function renderIdeas(opts: { ideas?: IdeaWithItem[]; respond?: (c: Call) => Response | undefined } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const custom = opts.respond?.(call);
    if (custom) return custom;
    const body =
      path === "/api/me" ? { id: 1, name: "Gideon", email: "g@x" }
      : path === "/api/rooms" ? ROOMS
      : path === "/api/items" ? ITEMS
      : path === "/api/ideas" && call.method === "GET" ? (opts.ideas ?? IDEAS)
      : path === "/api/ideas" ? UNLINKED
      : {};
    return new Response(JSON.stringify(body), { status: call.method === "POST" ? 201 : 200 });
  }));
  const loc = memoryLocation({ path: "/ideas", record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook}><Ideas /></Router>
    </QueryClientProvider>,
  );
  const writes = () => calls.filter((c) => c.method !== "GET");
  return { calls, writes, loc, qc };
}

it("shows Not linked yet first, then rooms with No room last", async () => {
  renderIdeas();
  await screen.findByText("Lamp");
  const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(headings[0]).toMatch(/^Not linked yet/);
  expect(headings.slice(1)).toEqual(["Kitchen", "No room"]);
  expect(screen.getByRole("link", { name: /Open link for Lamp/ })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: /Open link for Lamp/ })).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText("CHF 49.90")).toHaveClass("whitespace-nowrap");
});

it("filters to Not linked and Just mine, and says when nothing matches", async () => {
  renderIdeas({ ideas: [ON_DESK] });
  await screen.findByText("Oak desk");
  fireEvent.click(screen.getByRole("button", { name: "Just mine" }));
  expect(screen.getByRole("button", { name: "Just mine" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Not linked" }));
  expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("Oak desk")).toBeInTheDocument();
});

it("hides linked ideas under the Not linked filter", async () => {
  renderIdeas();
  await screen.findByText("Steel pan");
  fireEvent.click(screen.getByRole("button", { name: "Not linked" }));
  expect(screen.getByText("Lamp")).toBeInTheDocument();
  expect(screen.queryByText("Steel pan")).toBeNull();
});

it("explains unlinked ideas when there are none at all", async () => {
  renderIdeas({ ideas: [] });
  expect(await screen.findByText(/stays private to you until you link it/)).toBeInTheDocument();
  expect(screen.queryByText("Nothing matches this filter.")).toBeNull();
});

it("quick capture needs a link or a title, and flags an invalid price", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Paste a link or type a title.");
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Rug" } });
  fireEvent.change(screen.getByLabelText("Price"), { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a price like 19,90");
  expect(screen.getByLabelText("Price")).toHaveAttribute("aria-invalid", "true");
  expect(writes()).toEqual([]);
});

it("quick capture submits on Enter with the link, price and item", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  expect(screen.getByLabelText("Link")).toHaveAttribute("inputmode", "url");
  // Only items the viewer can edit, grouped by room.
  const forItem = screen.getByLabelText("For item");
  expect(within(forItem).queryByRole("option", { name: "Desk" })).toBeNull();
  expect(forItem.querySelector('optgroup[label="Kitchen"] option')?.textContent).toBe("Pan");
  fireEvent.change(screen.getByLabelText("Link"), { target: { value: " https://x.example/rug " } });
  fireEvent.change(screen.getByLabelText("Price"), { target: { value: "19,90" } });
  fireEvent.change(forItem, { target: { value: "5" } });
  fireEvent.submit(screen.getByLabelText("Link").closest("form")!);
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0]).toEqual({ method: "POST", path: "/api/ideas", body: { url: "https://x.example/rug", priceCents: 1990, itemId: 5 } });
  await waitFor(() => expect(screen.getByLabelText("Link")).toHaveValue(""));
});

it("quick capture shows errors below the field row, not inside it", async () => {
  renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  const form = screen.getByRole("form", { name: "Save an idea" });
  expect(screen.getByRole("alert").parentElement).toBe(form);
  expect(screen.getByLabelText("Link").parentElement).not.toBe(form);
});

it("quick capture adds https:// to a bare link, shows the shared hint and resets For item after saving", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  const forItem = screen.getByLabelText("For item");
  fireEvent.change(forItem, { target: { value: "6" } });
  expect(screen.queryByText("Everyone who can see this item will see the idea.")).toBeNull();
  fireEvent.change(forItem, { target: { value: "5" } });
  expect(screen.getByText("Everyone who can see this item will see the idea.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Link"), { target: { value: "x.example/rug" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0]!.body).toEqual({ url: "https://x.example/rug", itemId: 5 });
  await waitFor(() => expect(screen.getByLabelText("For item")).toHaveValue(""));
});

it("Make item says the idea becomes shared unless the room is my own", async () => {
  renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Make item" }));
  const hint = "This creates an item for everyone, so they'll see the idea.";
  expect(screen.getByText(hint)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Room for Lamp"), { target: { value: "2" } });
  expect(screen.queryByText(hint)).toBeNull();
  fireEvent.change(screen.getByLabelText("Room for Lamp"), { target: { value: "1" } });
  expect(screen.getByText(hint)).toBeInTheDocument();
});

it("clears an old error when another action starts", async () => {
  renderIdeas({
    respond: (c) =>
      c.method === "PATCH" ? new Response(JSON.stringify({ error: "not_creator", message: "No" }), { status: 403 }) : undefined,
  });
  await screen.findByText("Steel pan");
  fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Star Steel pan" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("shows the shop once when it is also the title", async () => {
  renderIdeas({ ideas: [base({ id: 1, title: "shop.example", url: "https://shop.example/x", shop: "shop.example" }), { ...ON_PAN, title: "ikea.ch", shop: "ikea.ch" }] });
  await screen.findByText("shop.example");
  expect(screen.getAllByText("shop.example")).toHaveLength(1);
  expect(screen.getAllByText("ikea.ch")).toHaveLength(1);
});

it("links an unlinked idea to an item, with the shared hint", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Link to item…" }));
  const select = screen.getByLabelText("Item for Lamp");
  fireEvent.change(select, { target: { value: "6" } });
  expect(screen.queryByText("Everyone who can see this item will see the idea.")).toBeNull();
  fireEvent.change(select, { target: { value: "5" } });
  expect(screen.getByText("Everyone who can see this item will see the idea.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  await waitFor(() => expect(writes()).toEqual([{ method: "PATCH", path: "/api/ideas/1", body: { itemId: 5 } }]));
});

it("makes an item from an unlinked idea in the chosen room", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Make item" }));
  fireEvent.change(screen.getByLabelText("Room for Lamp"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Create item" }));
  await waitFor(() => expect(writes()).toEqual([{ method: "POST", path: "/api/ideas/1/to-item", body: { roomId: 1 } }]));
});

it("asks before deleting an idea", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { writes } = renderIdeas();
  await screen.findByText("Lamp");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(confirm).toHaveBeenCalledWith('Delete idea "Lamp"?');
  expect(writes()).toEqual([]);
});

it("enables the star only with canEditItem, and shows move controls only on my ideas", async () => {
  const { writes } = renderIdeas();
  await screen.findByText("Oak desk");
  const deskStar = screen.getByRole("button", { name: "Star Oak desk" });
  expect(deskStar).toBeDisabled();
  expect(deskStar).toHaveAttribute("aria-pressed", "false");
  expect(deskStar).toHaveClass("min-h-11", "min-w-11");
  const panStar = screen.getByRole("button", { name: "Star Steel pan" });
  expect(panStar).toBeEnabled();
  expect(screen.getAllByRole("button", { name: "Unlink" })).toHaveLength(1);
  fireEvent.click(panStar);
  await waitFor(() => expect(writes()).toEqual([{ method: "PUT", path: "/api/items/5/favorite", body: { ideaId: 2 } }]));
});

it("opens the item modal route from the item name", async () => {
  const { loc } = renderIdeas();
  fireEvent.click(await screen.findByRole("button", { name: /Pan/ }));
  expect(loc.history?.at(-1)).toBe("/items/5");
});

it("shows the not_creator message when moving is refused", async () => {
  renderIdeas({
    respond: (c) =>
      c.method === "PATCH"
        ? new Response(JSON.stringify({ error: "not_creator", message: "No" }), { status: 403 })
        : undefined,
  });
  await screen.findByText("Steel pan");
  fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Only the person who added this idea can move it.");
});

it("refreshes ideas, items, overview and both items after a move", async () => {
  const { qc } = renderIdeas();
  await screen.findByText("Steel pan");
  const spy = vi.spyOn(qc, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "Move…" }));
  fireEvent.change(screen.getByLabelText("Move Steel pan to"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Move" }));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
  for (const k of ['["ideas"]', '["items"]', '["overview"]', '["item",5]', '["item",6]']) expect(keys).toContain(k);
});
