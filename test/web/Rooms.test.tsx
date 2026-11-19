import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Rooms from "../../src/web/pages/Rooms";

afterEach(() => vi.unstubAllGlobals());

const ROOMS = [
  { id: 1, name: "Kitchen", personId: null, sort: 1 },
  { id: 2, name: "Bathroom", personId: null, sort: 2 },
];
const PEOPLE = [{ id: 7, name: "Lena", email: "lena@example.com", sort: 1 }];

function renderRooms() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Rooms /></QueryClientProvider>);
}

/** GETs succeed; every write fails with a 500. */
function failingWrites() {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      return new Response(JSON.stringify(path === "/api/people" ? PEOPLE : ROOMS), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "internal", message: "Something went wrong" }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("adding a room sends personId null, as POST /api/rooms requires", async () => {
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ id: 9, name: "Balcony", personId: null, sort: 1 }), { status: 201 });
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  renderRooms();

  fireEvent.change(await screen.findByLabelText("New room name"), { target: { value: "Balcony" } });
  fireEvent.click(screen.getByRole("button", { name: "Add room" }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  const [path, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(path).toBe("/api/rooms");
  expect(JSON.parse(String(init!.body))).toEqual({ name: "Balcony", personId: null });
});

it("shows an error when adding a room fails", async () => {
  failingWrites();
  renderRooms();
  fireEvent.change(await screen.findByLabelText("New room name"), { target: { value: "Balcony" } });
  fireEvent.click(screen.getByRole("button", { name: "Add room" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not add the room");
});

it("a failed rename shows an error and reverts the name", async () => {
  failingWrites();
  renderRooms();
  const input = await screen.findByLabelText("Name of Kitchen");
  fireEvent.change(input, { target: { value: "Cookery" } });
  fireEvent.blur(input);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the room");
  await waitFor(() => expect(input).toHaveValue("Kitchen"));
});

it("shows an error when changing the owner fails", async () => {
  failingWrites();
  renderRooms();
  fireEvent.change(await screen.findByLabelText("Owner of Kitchen"), { target: { value: "7" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the room");
});

it("shows an error when removing a room fails", async () => {
  failingWrites();
  vi.stubGlobal("confirm", () => true);
  renderRooms();
  fireEvent.click(await screen.findByRole("button", { name: "Delete Kitchen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete the room");
});

it("shows an error when reordering fails", async () => {
  failingWrites();
  renderRooms();
  fireEvent.click(await screen.findByRole("button", { name: "Move Bathroom up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not reorder the rooms");
});

it("room names take a full row on phones so the controls go below instead of cutting the name", async () => {
  failingWrites();
  renderRooms();
  expect(await screen.findByLabelText("Name of Kitchen")).toHaveClass("basis-full");
  expect(screen.getByRole("button", { name: "Delete Kitchen" })).toHaveClass("ml-auto");
});

it("warns about a duplicate room name but still allows it", async () => {
  failingWrites();
  renderRooms();
  fireEvent.change(await screen.findByLabelText("New room name"), { target: { value: " kitchen " } });
  expect(screen.getByText(/already a room with this name/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add room" })).toBeEnabled();
});
