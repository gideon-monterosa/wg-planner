import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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

function renderItem(quantity: number) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const body = path === "/api/items/5" ? item(quantity) : path === "/api/me" ? { id: 1, name: "G", email: "g@x" } : [];
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
});
