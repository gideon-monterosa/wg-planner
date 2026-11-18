import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError, request, useItem } from "../../src/web/api";

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

it("ApiError.code falls back to http_error when error is not a string", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: { name: "ZodError" } }), { status: 400 })));
  const err = await request("POST", "/api/x", {}).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe("http_error");
  expect((err as ApiError).status).toBe(400);
});

it("ApiError.code keeps a string error code", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "read_only", message: "No" }), { status: 403 })));
  const err = (await request("POST", "/api/x", {}).catch((e: unknown) => e)) as ApiError;
  expect(err.code).toBe("read_only");
  expect(err.message).toBe("No");
});
