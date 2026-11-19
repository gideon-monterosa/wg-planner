import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import App from "../../src/web/App";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  return Object.assign(loc, { qc });
}

const topNav = () => screen.getByTestId("top-nav");
const bottomNav = () => screen.getByTestId("bottom-nav");
const tabLabels = (nav: HTMLElement) => Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);

it("renders both navs with three tabs, and a gear linking to settings", async () => {
  renderApp("/");
  await screen.findByTestId("top-nav");
  expect(tabLabels(topNav())).toEqual(["List", "Ideas", "Overview"]);
  expect(tabLabels(bottomNav())).toEqual(["List", "Ideas", "Overview"]);
  expect(topNav()).toHaveClass("hidden", "md:flex");
  expect(bottomNav()).toHaveClass("md:hidden");
  for (const nav of [topNav(), bottomNav()]) {
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["/", "/ideas", "/overview"]);
  }
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

it("closes the dialog with the close button and lands on /", async () => {
  const loc = renderApp("/items/1");
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(loc.history?.at(-1)).toBe("/");
});

it("closes a deep-linked item with replace, not history.back", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const loc = renderApp("/items/1");
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(back).not.toHaveBeenCalled();
  expect(loc.history).toEqual(["/"]);
});

async function openFromList() {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const loc = renderApp("/");
  fireEvent.click(await screen.findByRole("button", { name: /Chair/ }));
  await screen.findByRole("dialog");
  return { back, loc };
}

it("closes an item opened from the list with history.back", async () => {
  const { back, loc } = await openFromList();
  expect(loc.history?.at(-1)).toBe("/items/1");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(back).toHaveBeenCalledTimes(1);
});

it("navigates only once on rapid double close", async () => {
  const { back } = await openFromList();
  const x = screen.getByRole("button", { name: "Close" });
  fireEvent.click(x);
  fireEvent.click(x);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(back).toHaveBeenCalledTimes(1);
});

it("routes item delete through the close path", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { back } = await openFromList();
  fireEvent.click(await screen.findByRole("button", { name: "Delete item" }));
  await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
});

it("makes the background inert only while the dialog is open", async () => {
  const loc = renderApp("/items/1");
  await screen.findByRole("dialog");
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("inert");
  expect(bottomNav()).toHaveAttribute("inert");
  expect(topNav().closest("[inert]")).not.toBeNull();
  expect(document.querySelector("header")).toHaveAttribute("inert");
  expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(loc.history?.at(-1)).toBe("/");
  expect(screen.getByRole("main")).not.toHaveAttribute("inert");
  expect(bottomNav()).not.toHaveAttribute("inert");
  expect(topNav().closest("[inert]")).toBeNull();
});

it("closes on a swipe past the threshold but not a short one", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  renderApp("/items/1");
  await screen.findByRole("dialog");
  const handle = screen.getByTestId("drag-handle");
  fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: 40, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientY: 40, pointerId: 1 });
  expect(back).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: 120, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientY: 120, pointerId: 1 });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

/** Active tab labels in both navs; they must always agree. */
function activeTabs() {
  const active = (nav: HTMLElement) => Array.from(nav.querySelectorAll("a[aria-current]")).map((a) => a.textContent);
  const top = active(topNav());
  expect(active(bottomNav())).toEqual(top);
  return top;
}

it("marks no tab active on /settings, and marks the gear current", async () => {
  renderApp("/settings");
  await screen.findByRole("heading", { name: "Rooms" });
  expect(activeTabs()).toEqual([]);
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

it("shows a not-found page with a way back, and no active tab, on an unknown route", async () => {
  renderApp("/nope");
  expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to the list" })).toHaveAttribute("href", "/");
  expect(activeTabs()).toEqual([]);
  expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
});

it("marks List active on /", async () => {
  renderApp("/");
  await screen.findByRole("button", { name: /Chair/ });
  expect(activeTabs()).toEqual(["List"]);
});

it("marks List active on an item", async () => {
  renderApp("/items/1");
  await screen.findByRole("dialog");
  expect(activeTabs()).toEqual(["List"]);
});

it("marks Ideas active on /ideas and shows the Ideas page", async () => {
  renderApp("/ideas");
  expect(await screen.findByRole("heading", { name: "Ideas" })).toBeInTheDocument();
  expect(activeTabs()).toEqual(["Ideas"]);
  expect(screen.queryByRole("group", { name: "Filter" })).toBeNull();
});

it("opens an item over the Ideas page, keeps Ideas active, and closes back to it", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const loc = renderApp("/ideas");
  await screen.findByRole("heading", { name: "Ideas" });
  act(() => loc.navigate("/items/1"));
  await screen.findByRole("dialog");
  expect(screen.getByRole("heading", { name: "Ideas" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Filter" })).toBeNull();
  expect(activeTabs()).toEqual(["Ideas"]);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(back).toHaveBeenCalledTimes(1);
});

it("marks Overview active on /overview", async () => {
  renderApp("/overview");
  await screen.findByTestId("top-nav");
  expect(activeTabs()).toEqual(["Overview"]);
});

it("shows not found for a non-numeric item id instead of loading forever", async () => {
  renderApp("/items/abc");
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText("This item doesn't exist or isn't shared with you.")).toBeInTheDocument();
  expect(within(dialog).queryByText("Loading…")).toBeNull();
});

it("'Back to the list' on a deep-linked missing item closes the dialog with replace", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const loc = renderApp("/items/abc");
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByRole("button", { name: "Back to the list" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(back).not.toHaveBeenCalled();
  expect(loc.history).toEqual(["/"]);
});

it("'Back to the list' after opening a missing item from the list goes back, not forward", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  const loc = renderApp("/");
  await screen.findByRole("button", { name: /Chair/ });
  act(() => loc.navigate("/items/abc"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(await within(dialog).findByRole("button", { name: "Back to the list" }));
  expect(back).toHaveBeenCalledTimes(1);
  expect(loc.history).toEqual(["/", "/items/abc"]);
});

it("shows the list error with a working Try again button", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (p: string) => {
    if (p === "/api/items" && fail) return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
    const body =
      p === "/api/me" ? { id: 1, name: "Gideon", email: "g@x" }
      : p === "/api/people" ? PEOPLE
      : p === "/api/rooms" ? ROOMS
      : p === "/api/items" ? [SUMMARY]
      : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={memoryLocation({ path: "/" }).hook}><App /></Router>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the list.");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: /Chair/ })).toBeInTheDocument();
});

it("shows the first-run hint with one person", async () => {
  renderApp("/", [PEOPLE[0]]);
  expect(await screen.findByRole("link", { name: /Add your flatmates and rooms/ })).toHaveAttribute("href", "/settings");
});

it("hides the hint with two people", async () => {
  const loc = renderApp("/");
  await screen.findByRole("button", { name: /Chair/ });
  // Wait until the people query has actually resolved with both people.
  await waitFor(() =>
    expect(loc.qc.getQueryCache().getAll().some((q) => Array.isArray(q.state.data) && q.state.data.length === 2 && q.state.status === "success")).toBe(true),
  );
  await act(async () => {});
  expect(screen.queryByText(/Add your flatmates and rooms/)).toBeNull();
});

it("redirects /rooms to /settings", async () => {
  const loc = renderApp("/rooms");
  expect(await screen.findByRole("heading", { name: "Rooms" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
  expect(loc.history?.at(-1)).toBe("/settings");
});
