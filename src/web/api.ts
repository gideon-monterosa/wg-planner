import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ItemDetail, ItemSummary, Overview, Payer, Person, Room, Status } from "../shared/types.ts";

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
    let data: { error?: string; message?: string; email?: string } = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, data.error ?? "error", data.message, data.email);
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
export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: () => request<Overview>("GET", "/api/overview") });

// ---- invalidation helpers ----
const invalidateItems = (qc: QueryClient, itemId?: number) => {
  qc.invalidateQueries({ queryKey: ["items"] });
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

// ---- idea mutations (all return the parent ItemDetail) ----
export function useAddIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...idea }: IdeaInput & { itemId: number; title: string }) =>
      request<ItemDetail>("POST", `/api/items/${itemId}/ideas`, idea),
    onSuccess: (d) => afterDetail(qc, d),
  });
}
export function usePatchIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: IdeaInput & { id: number }) => request<ItemDetail>("PATCH", `/api/ideas/${id}`, patch),
    onSuccess: (d) => afterDetail(qc, d),
  });
}
export function useDeleteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<ItemDetail>("DELETE", `/api/ideas/${id}`),
    onSuccess: (d) => afterDetail(qc, d),
  });
}
export function useSetFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ideaId }: { itemId: number; ideaId: number | null }) =>
      request<ItemDetail>("PUT", `/api/items/${itemId}/favorite`, { ideaId }),
    onSuccess: (d) => afterDetail(qc, d),
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
