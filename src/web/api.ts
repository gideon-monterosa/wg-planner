import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { IdeaWithItem, ItemDetail, ItemSummary, Overview, Payer, Person, Room, Status } from "../shared/types.ts";

export class ApiError extends Error {
  status: number;
  code: string;
  email?: string;
  constructor(status: number, code: string, message?: string, email?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.email = email;
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let data: { error?: unknown; message?: string; email?: string } = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const code = typeof data.error === "string" ? data.error : "http_error";
    throw new ApiError(res.status, code, data.message, data.email);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Me { id: number; name: string; email: string }

export interface ItemInput {
  name?: string;
  roomId?: number | null;
  forPersonId?: number | null;
  forMe?: boolean;
  visibleToAll?: boolean;
  status?: Status;
  payer?: Payer;
  quantity?: number;
  ownPriceCents?: number | null;
  pricePaidCents?: number | null;
  notes?: string;
}
export interface IdeaInput {
  title?: string;
  url?: string;
  shop?: string;
  priceCents?: number | null;
  imageUrl?: string;
  notes?: string;
}

// ---- queries ----
/** Retry network and 5xx errors, but not 4xx answers like 403 not_set_up or 404 not_found. */
const retryUnless4xx = (count: number, err: Error) => !(err instanceof ApiError && err.status < 500) && count < 2;

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => request<Me>("GET", "/api/me"),
    retry: retryUnless4xx,
  });
export const usePeople = () => useQuery({ queryKey: ["people"], queryFn: () => request<Person[]>("GET", "/api/people") });
export const useRooms = () => useQuery({ queryKey: ["rooms"], queryFn: () => request<Room[]>("GET", "/api/rooms") });
export const useItems = () => useQuery({ queryKey: ["items"], queryFn: () => request<ItemSummary[]>("GET", "/api/items") });
export const useItem = (id: number) =>
  useQuery({
    queryKey: ["item", id],
    queryFn: () => request<ItemDetail>("GET", `/api/items/${id}`),
    enabled: Number.isFinite(id),
    retry: retryUnless4xx,
  });
export const useIdeas = () => useQuery({ queryKey: ["ideas"], queryFn: () => request<IdeaWithItem[]>("GET", "/api/ideas") });
export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: () => request<Overview>("GET", "/api/overview") });

// ---- invalidation helpers ----
const invalidateItems = (qc: QueryClient, itemId?: number) => {
  qc.invalidateQueries({ queryKey: ["items"] });
  // Ideas carry their item's name, room and scope, and vanish with a deleted item.
  qc.invalidateQueries({ queryKey: ["ideas"] });
  qc.invalidateQueries({ queryKey: ["overview"] });
  if (itemId !== undefined) qc.invalidateQueries({ queryKey: ["item", itemId] });
};
const afterDetail = (qc: QueryClient, d: ItemDetail) => {
  qc.setQueryData(["item", d.id], d);
  invalidateItems(qc, d.id);
};

// ---- item mutations ----
export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput & { name: string }) => request<ItemDetail>("POST", "/api/items", input),
    onSuccess: (d) => afterDetail(qc, d),
  });
}
export function usePatchItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: ItemInput & { id: number }) => request<ItemDetail>("PATCH", `/api/items/${id}`, patch),
    onSuccess: (d) => afterDetail(qc, d),
  });
}
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<void>("DELETE", `/api/items/${id}`),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ["item", id] });
      invalidateItems(qc);
    },
  });
}

// ---- idea mutations ----
/** `PATCH /api/ideas/:id` answers with the item when the idea ends up linked, otherwise with the idea itself. */
export type IdeaResult = ItemDetail | IdeaWithItem;
export const isItemDetail = (r: IdeaResult | undefined | void): r is ItemDetail => !!r && "ideas" in r;

/** The item an idea is linked to right now, from the ideas list in the cache (undefined when unknown). */
const cachedIdeaItem = (qc: QueryClient, ideaId: number): number | null | undefined =>
  qc.getQueryData<IdeaWithItem[]>(["ideas"])?.find((i) => i.id === ideaId)?.itemId;

/**
 * After any idea change: refresh the ideas list, the item list, the overview and every affected item
 * (source and target of a move). The response body alone never covers all of them.
 */
function afterIdeaChange(qc: QueryClient, itemIds: (number | null | undefined)[], result?: IdeaResult | void) {
  if (isItemDetail(result)) qc.setQueryData(["item", result.id], result);
  qc.invalidateQueries({ queryKey: ["ideas"] });
  qc.invalidateQueries({ queryKey: ["items"] });
  qc.invalidateQueries({ queryKey: ["overview"] });
  const ids = new Set(itemIds.filter((id): id is number => typeof id === "number"));
  if (isItemDetail(result)) ids.add(result.id);
  for (const id of ids) qc.invalidateQueries({ queryKey: ["item", id] });
}

/** Adds an idea from the item modal (always linked to that item). */
export function useAddIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...idea }: IdeaInput & { itemId: number; title: string }) =>
      request<ItemDetail>("POST", `/api/items/${itemId}/ideas`, idea),
    onSuccess: (d, v) => afterIdeaChange(qc, [v.itemId], d),
  });
}
/** Quick capture: `POST /api/ideas`, linked when `itemId` is given, otherwise unlinked. */
export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IdeaInput & { itemId?: number | null }) => request<IdeaWithItem>("POST", "/api/ideas", input),
    onSuccess: (idea) => afterIdeaChange(qc, [idea.itemId]),
  });
}
export interface PatchIdeaVars extends IdeaInput {
  id: number;
  /** null unlinks; a number links or moves. */
  itemId?: number | null;
  /** The item the idea is on now (not sent), so it is refreshed too; without it the ideas cache is asked. */
  fromItemId?: number | null;
}
/** Edits an idea; `itemId` links, moves or unlinks it. */
export function usePatchIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fromItemId: _from, ...patch }: PatchIdeaVars) => request<IdeaResult>("PATCH", `/api/ideas/${id}`, patch),
    onMutate: (v) => ({ source: v.fromItemId !== undefined ? v.fromItemId : cachedIdeaItem(qc, v.id) }),
    onSuccess: (res, v, ctx) => afterIdeaChange(qc, [ctx?.source, v.itemId], res),
  });
}
/** Deletes an idea: answers with its item when it was linked, nothing (204) when it wasn't. */
export function useDeleteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<ItemDetail | undefined>("DELETE", `/api/ideas/${id}`),
    onMutate: (id) => ({ source: cachedIdeaItem(qc, id) }),
    onSuccess: (res, _id, ctx) => afterIdeaChange(qc, [ctx?.source], res),
  });
}
/** "Make item": creates an item named after the idea and links the idea to it. */
export function useIdeaToItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roomId }: { id: number; roomId: number | null }) =>
      request<ItemDetail>("POST", `/api/ideas/${id}/to-item`, { roomId }),
    onMutate: (v) => ({ source: cachedIdeaItem(qc, v.id) }),
    onSuccess: (d, _v, ctx) => afterIdeaChange(qc, [ctx?.source], d),
  });
}
export function useSetFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ideaId }: { itemId: number; ideaId: number | null }) =>
      request<ItemDetail>("PUT", `/api/items/${itemId}/favorite`, { ideaId }),
    onSuccess: (d, v) => afterIdeaChange(qc, [v.itemId], d),
  });
}

// ---- rooms / people ----
export function useRoomMutations() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["rooms"] });
    invalidateItems(qc);
  };
  return {
    create: useMutation({
      mutationFn: (input: { name: string; personId: number | null }) => request<Room>("POST", "/api/rooms", input),
      onSuccess: done,
    }),
    patch: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; personId?: number | null }) =>
        request<Room>("PATCH", `/api/rooms/${id}`, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => request<void>("DELETE", `/api/rooms/${id}`),
      onSuccess: done,
    }),
    reorder: useMutation({
      mutationFn: (ids: number[]) => request<Room[]>("PUT", "/api/rooms/order", { ids }),
      onSuccess: done,
    }),
  };
}
export function usePeopleMutations() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    invalidateItems(qc);
  };
  return {
    create: useMutation({
      mutationFn: (input: { name: string; email: string }) => request<Person>("POST", "/api/people", input),
      onSuccess: done,
    }),
    patch: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; email?: string }) =>
        request<Person>("PATCH", `/api/people/${id}`, patch),
      onSuccess: done,
    }),
  };
}
