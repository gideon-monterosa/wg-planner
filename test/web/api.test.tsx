import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useItem } from "../../src/web/api";

afterEach(() => vi.unstubAllGlobals());

it("useItem fails at once on a 404 instead of retrying, so the not-found message shows", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

  const { result } = renderHook(() => useItem(6), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 500 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
