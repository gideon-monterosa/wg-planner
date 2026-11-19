import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ItemDetail } from "../../src/shared/types";
import ItemPage from "../../src/web/pages/ItemPage";

afterEach(() => vi.unstubAllGlobals());

function item(quantity: number): ItemDetail {
  return {
    id: 5, name: "Chair", roomId: null, forPersonId: null, visibleToAll: false, status: "needed",
    payer: { kind: "none" }, quantity, ideaCount: 1, price: { kind: "own", cents: 1900 * quantity },
    plannedCents: 1900 * quantity, spentCents: 0, canEdit: true, ownPriceCents: 1900, pricePaidCents: null, notes: "",
    ideas: [{ id: 3, itemId: 5, title: "IKEA chair", url: "", shop: "", priceCents: 2500, imageUrl: "", notes: "", isFavorite: false }],
  };
}

function renderItem(quantity: number, overrides: Partial<ItemDetail> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const body = path === "/api/items/5" ? { ...item(quantity), ...overrides } : path === "/api/me" ? { id: 1, name: "G", email: "g@x" } : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={memoryLocation({ path: "/items/5" }).hook}><ItemPage /></Router>
    </QueryClientProvider>,
  );
}

it("labels prices per piece when the quantity is above 1", async () => {
  renderItem(4);
  expect(await screen.findByLabelText("Own price (per piece)")).toBeInTheDocument();
  expect(screen.getByLabelText("New idea price per piece")).toHaveAttribute("placeholder", "Price per piece");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Idea price per piece")).toHaveAttribute("placeholder", "Price per piece");
});

it("keeps the plain labels for a single piece", async () => {
  renderItem(1);
  expect(await screen.findByLabelText("Own price")).toBeInTheDocument();
  expect(screen.queryByLabelText("Own price (per piece)")).toBeNull();
  expect(screen.getByLabelText("New idea price")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Idea price")).toBeInTheDocument();
  expect(screen.queryByText(/^1 × /)).toBeNull();
});

it("shows the per-piece price next to the total when the quantity is above 1", async () => {
  renderItem(4);
  expect(await screen.findByText("4 × CHF 19.–")).toBeInTheDocument();
});

it("shows a hint when an item has no ideas yet", async () => {
  renderItem(1, { ideas: [], ideaCount: 0 });
  expect(await screen.findByText("No ideas yet. Paste a link below.")).toBeInTheDocument();
});

it("keeps the open form when a background refetch fails", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/items/5" && ++calls > 1) return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
    const body = path === "/api/items/5" ? item(1) : path === "/api/me" ? { id: 1, name: "G", email: "g@x" } : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={memoryLocation({ path: "/items/5" }).hook}><ItemPage /></Router>
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText("Own price")).toBeInTheDocument();
  await act(() => qc.refetchQueries({ queryKey: ["item", 5] }));
  await waitFor(() => expect(qc.getQueryState(["item", 5])?.status).toBe("error"));
  expect(screen.getByLabelText("Own price")).toBeInTheDocument();
  expect(screen.queryByText("Could not load this item.")).toBeNull();
});

describe("Add from your saved ideas", () => {
  const saved = (over: Record<string, unknown>) => ({
    id: 9, title: "Saved lamp", url: "", shop: "", priceCents: 1500, imageUrl: "", notes: "", isFavorite: false,
    itemId: null, itemName: null, roomId: null, itemStatus: null, itemForPersonId: null, itemVisibleToAll: null,
    canEdit: true, canEditItem: false, isMine: true, ...over,
  });

  function renderWithIdeas(ideas: unknown[], overrides: Partial<ItemDetail> = {}) {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body =
        path === "/api/items/5" || method === "PATCH" ? { ...item(1), ...overrides }
        : path === "/api/me" ? { id: 1, name: "G", email: "g@x" }
        : path === "/api/ideas" ? ideas
        : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={memoryLocation({ path: "/items/5" }).hook}><ItemPage /></Router>
      </QueryClientProvider>,
    );
    return calls;
  }

  it("links the chosen unlinked idea of mine to the item", async () => {
    const calls = renderWithIdeas([
      saved({}),
      saved({ id: 10, title: "Someone else's", isMine: false }),
      saved({ id: 11, title: "Already linked", itemId: 4 }),
    ]);
    const select = await screen.findByLabelText("Add from your saved ideas");
    expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Choose an idea…", "Saved lamp · CHF 15.–"]);
    fireEvent.change(select, { target: { value: "9" } });
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PATCH")).toEqual([{ method: "PATCH", path: "/api/ideas/9", body: { itemId: 5 } }]),
    );
  });

  it("is hidden without saved ideas", async () => {
    renderWithIdeas([saved({ itemId: 4 })]);
    await screen.findByLabelText("Own price");
    await act(async () => {});
    expect(screen.queryByLabelText("Add from your saved ideas")).toBeNull();
  });

  it("is hidden when the viewer can't edit the item", async () => {
    renderWithIdeas([saved({})], { canEdit: false });
    await screen.findByLabelText("Own price");
    await act(async () => {});
    expect(screen.queryByLabelText("Add from your saved ideas")).toBeNull();
  });
});
