import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import App from "../../src/web/App";

afterEach(() => vi.unstubAllGlobals());

const PEOPLE = [
  { id: 1, name: "Gideon", email: "g@x", sort: 1 },
  { id: 2, name: "Lena", email: "l@x", sort: 2 },
];
const ROOMS = [{ id: 1, name: "Kitchen", personId: null, sort: 1 }];
const SUMMARY = {
  id: 1, name: "Chair", roomId: 1, forPersonId: null, visibleToAll: false, status: "needed",
  payer: { kind: "none" }, quantity: 1, ideaCount: 0, price: { kind: "own", cents: 1900 },
  plannedCents: 1900, spentCents: 0,
};
const DETAIL = { ...SUMMARY, canEdit: true, ownPriceCents: 1900, pricePaidCents: null, notes: "", ideas: [] };

function renderApp(path: string, people = PEOPLE) {
  vi.stubGlobal("fetch", vi.fn(async (p: string) => {
    const body =
      p === "/api/me" ? { id: 1, name: "Gideon", email: "g@x" }
      : p === "/api/people" ? people
      : p === "/api/rooms" ? ROOMS
      : p === "/api/items" ? [SUMMARY]
      : p === "/api/items/1" ? DETAIL
      : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  const loc = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook}><App /></Router>
    </QueryClientProvider>,
  );
  return loc;
}

it("has two bottom tabs and a gear linking to settings", async () => {
  renderApp("/");
  const nav = await screen.findByRole("navigation");
  const links = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
  expect(links).toEqual(["List", "Overview"]);
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
});

it("shows the list and the item dialog together at /items/1", async () => {
  renderApp("/items/1");
  expect(await screen.findByRole("dialog")).toHaveAttribute("aria-modal", "true");
  expect(await screen.findByRole("button", { name: /Chair/ })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Filter" })).toBeInTheDocument();
});

it("closes the dialog with Escape", async () => {
  const loc = renderApp("/items/1");
  await screen.findByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(loc.history?.at(-1)).toBe("/");
});

it("closes the dialog with the close button", async () => {
  renderApp("/items/1");
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("shows the first-run hint with one person", async () => {
  renderApp("/", [PEOPLE[0]]);
  expect(await screen.findByRole("link", { name: /Add your flatmates and rooms/ })).toHaveAttribute("href", "/settings");
});

it("hides the hint with two people", async () => {
  renderApp("/");
  await screen.findByRole("group", { name: "Filter" });
  await waitFor(() => expect(screen.queryByText(/Add your flatmates and rooms/)).toBeNull());
});

it("redirects /rooms to /settings", async () => {
  const loc = renderApp("/rooms");
  expect(await screen.findByRole("heading", { name: "Rooms" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  expect(loc.history?.at(-1)).toBe("/settings");
});
