import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { IdeaWithItem, ItemDetail } from "../../src/shared/types";
import { ApiError, useDeleteIdea, useDeleteItem, usePatchIdea, usePatchItem } from "../../src/web/api";
import { ideaErrorMessage } from "../../src/web/ideaErrors";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DETAIL: ItemDetail = {
  id: 5, name: "Pan", roomId: null, forPersonId: null, visibleToAll: false, status: "needed", payer: { kind: "none" },
  quantity: 1, ideaCount: 0, price: { kind: "none" }, plannedCents: 0, spentCents: 0, canEdit: true,
  ownPriceCents: null, pricePaidCents: null, notes: "", ideas: [],
};
const UNLINKED: IdeaWithItem = {
  id: 2, title: "Lamp", url: "", shop: "", priceCents: null, imageUrl: "", notes: "", isFavorite: false,
  itemId: null, itemName: null, roomId: null, itemStatus: null, itemForPersonId: null, itemVisibleToAll: null,
  canEdit: true, canEditItem: false, isMine: true,
};

function setup(response: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const keys = () => spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
  return { qc, wrapper, keys };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

it("an item rename refreshes the ideas list", async () => {
  const { wrapper, keys } = setup(json({ ...DETAIL, name: "Wok" }));
  const { result } = renderHook(() => usePatchItem(), { wrapper });
  await act(() => result.current.mutateAsync({ id: 5, name: "Wok" }));
  expect(keys()).toContain('["ideas"]');
});

it("an item delete refreshes the ideas list", async () => {
  const { wrapper, keys } = setup(() => new Response(null, { status: 204 }));
  const { result } = renderHook(() => useDeleteItem(), { wrapper });
  await act(() => result.current.mutateAsync(5));
  expect(keys()).toContain('["ideas"]');
});

it("an unlink answering with the idea refreshes the old item without overwriting its cache", async () => {
  const { qc, wrapper, keys } = setup(json(UNLINKED));
  qc.setQueryData(["item", 5], DETAIL);
  const { result } = renderHook(() => usePatchIdea(), { wrapper });
  const res = await act(() => result.current.mutateAsync({ id: 2, itemId: null, fromItemId: 5 }));
  expect(res).toEqual(UNLINKED);
  expect(qc.getQueryData(["item", 5])).toEqual(DETAIL);
  for (const k of ['["ideas"]', '["items"]', '["overview"]', '["item",5]']) expect(keys()).toContain(k);
});

it("a linked delete stores the returned item and refreshes it", async () => {
  const after = { ...DETAIL, notes: "after" };
  const { qc, wrapper, keys } = setup(json(after));
  qc.setQueryData(["ideas"], [{ ...UNLINKED, itemId: 5 }]);
  const { result } = renderHook(() => useDeleteIdea(), { wrapper });
  await act(() => result.current.mutateAsync(2));
  expect(qc.getQueryData(["item", 5])).toEqual(after);
  for (const k of ['["ideas"]', '["items"]', '["overview"]', '["item",5]']) expect(keys()).toContain(k);
});

it("an unlinked delete accepts the 204 and refreshes the ideas list", async () => {
  const { qc, wrapper, keys } = setup(() => new Response(null, { status: 204 }));
  qc.setQueryData(["ideas"], [UNLINKED]);
  const { result } = renderHook(() => useDeleteIdea(), { wrapper });
  const res = await act(() => result.current.mutateAsync(2));
  expect(res).toBeUndefined();
  expect(keys()).toContain('["ideas"]');
  expect(keys().some((k) => k.startsWith('["item",'))).toBe(false);
});

it("maps the ideas API error codes to messages", () => {
  expect(ideaErrorMessage(new ApiError(403, "not_creator"))).toBe("Only the person who added this idea can move it.");
  expect(ideaErrorMessage(new ApiError(403, "read_only"))).toBe("You can't edit that item.");
  expect(ideaErrorMessage(new ApiError(404, "not_found"))).toBe("That idea or item no longer exists.");
  expect(ideaErrorMessage(new ApiError(400, "invalid_body"))).toBe("Check the link (http or https) and the price.");
  expect(ideaErrorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
});
