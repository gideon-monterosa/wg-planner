import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Rooms from "../../src/web/pages/Rooms";

afterEach(() => vi.unstubAllGlobals());

it("adding a room sends personId null, as POST /api/rooms requires", async () => {
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ id: 9, name: "Balcony", personId: null, sort: 1 }), { status: 201 });
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Rooms /></QueryClientProvider>);

  fireEvent.change(await screen.findByLabelText("New room name"), { target: { value: "Balcony" } });
  fireEvent.click(screen.getByRole("button", { name: "Add room" }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  const [path, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(path).toBe("/api/rooms");
  expect(JSON.parse(String(init!.body))).toEqual({ name: "Balcony", personId: null });
});
