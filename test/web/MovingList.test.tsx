import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import MovingList from "../../src/web/pages/MovingList";

afterEach(() => vi.unstubAllGlobals());

const PEOPLE = [
  { id: 1, name: "Gideon", email: "g@x", sort: 1 },
  { id: 2, name: "Lena", email: "l@x", sort: 2 },
];
const ROOMS = [{ id: 1, name: "Kitchen", personId: null, sort: 1 }];
const base = {
  roomId: 1, visibleToAll: false, status: "needed", payer: { kind: "none" }, quantity: 1, ideaCount: 0,
  price: { kind: "none" }, plannedCents: 0, spentCents: 0, canEdit: true,
};
const ITEMS = [
  { ...base, id: 1, name: "A very long standing desk name that will be truncated", forPersonId: 1 },
  { ...base, id: 2, name: "Kettle", forPersonId: null },
];

function renderList(items = ITEMS) {
  vi.stubGlobal("fetch", vi.fn(async (p: string) => {
    const body =
      p === "/api/me" ? { id: 1, name: "Gideon", email: "g@x" }
      : p === "/api/people" ? PEOPLE
      : p === "/api/rooms" ? ROOMS
      : p === "/api/items" ? items
      : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={memoryLocation({ path: "/" }).hook}><MovingList /></Router>
    </QueryClientProvider>,
  );
}

it("keeps the 'only you' badge outside the truncated name", async () => {
  renderList();
  const badge = await screen.findByText("only you");
  expect(badge.closest(".truncate")).toBeNull();
  expect(badge).toHaveClass("shrink-0");
  expect(screen.getByRole("button", { name: /truncated,\s?only you/ })).toBeInTheDocument();
});

it("says 'No payer yet' for shared items and skips the payer on personal ones", async () => {
  renderList();
  expect(await screen.findByText("Everyone · no ideas yet · No payer yet")).toBeInTheDocument();
  expect(screen.getByText("Just you · no ideas yet")).toBeInTheDocument();
});

it("shows an empty state when a filter matches nothing", async () => {
  renderList([ITEMS[1]!]);
  fireEvent.click(await screen.findByRole("button", { name: "Just mine" }));
  expect(screen.getByText("Nothing matches this filter.")).toBeInTheDocument();
});

it("lets wide prices and ranges size their own cell instead of spilling out", async () => {
  renderList([
    { ...ITEMS[1]!, price: { kind: "range", minCents: 115000, maxCents: 226000 } },
    { ...ITEMS[1]!, id: 3, name: "Sofa", price: { kind: "own", cents: 1234000 } },
  ]);
  const range = await screen.findByText("CHF 1'150–2'260.–");
  const cell = range.closest('[data-testid="price"]')!;
  expect(cell).toHaveClass("min-w-24", "shrink-0", "whitespace-nowrap", "text-right");
  expect(cell).not.toHaveClass("w-24");
  expect(screen.getByText("≈ CHF 12'340.–").closest('[data-testid="price"]')).toHaveClass("min-w-24");
});

it("shows the status pill in the subline row on phones and as its own column from sm", async () => {
  renderList([ITEMS[1]!]);
  const pills = await screen.findAllByText("Needed");
  expect(pills).toHaveLength(2);
  expect(pills[0]!.parentElement).toHaveClass("sm:hidden");
  expect(pills[0]!.parentElement!.parentElement).toHaveTextContent("No payer yet");
  expect(pills[1]!.parentElement).toHaveClass("hidden", "sm:block");
});
