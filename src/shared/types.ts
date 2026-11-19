export type Status = "needed" | "decided" | "bought" | "owned";
export type Payer = { kind: "none" } | { kind: "together" } | { kind: "person"; personId: number };
export interface Person { id: number; name: string; email: string; sort: number }
export interface Room { id: number; name: string; personId: number | null; sort: number }
export type PriceInfo =
  | { kind: "paid" | "favorite" | "own"; cents: number }
  | { kind: "range"; minCents: number; maxCents: number }
  | { kind: "none" };
export interface ItemSummary {
  id: number; name: string; roomId: number | null; forPersonId: number | null;
  visibleToAll: boolean; status: Status; payer: Payer; quantity: number;
  ideaCount: number; price: PriceInfo; plannedCents: number; spentCents: number; canEdit: boolean;
}
export interface Idea {
  id: number; itemId: number; title: string; url: string; shop: string;
  priceCents: number | null; imageUrl: string; notes: string; isFavorite: boolean;
}
/** An idea as listed by `GET /api/ideas`: `itemId` is null for an unlinked idea (then every `item*` field is null). */
export interface IdeaWithItem extends Omit<Idea, "itemId"> {
  itemId: number | null; itemName: string | null; roomId: number | null; itemStatus: Status | null;
  itemForPersonId: number | null; itemVisibleToAll: boolean | null;
  /** May edit, move or delete the idea itself. */
  canEdit: boolean;
  /** May edit the linked item (false when unlinked). */
  canEditItem: boolean;
  /** Created by the viewer. */
  isMine: boolean;
}
export interface ItemDetail extends ItemSummary {
  ownPriceCents: number | null; pricePaidCents: number | null; notes: string; ideas: Idea[];
}
export interface OverviewRow { key: string; label: string; ownCents: number; sharedCents: number }
export interface OverviewMode { me: { ownCents: number; sharedCents: number; totalCents: number }; rows: OverviewRow[] }
export interface Overview { planned: OverviewMode; spent: OverviewMode }
