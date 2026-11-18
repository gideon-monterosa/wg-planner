import type { PriceInfo, Status } from "./types";

export interface PricingInput {
  status: Status;
  quantity: number;
  ownPriceCents: number | null;
  pricePaidCents: number | null;
  ideas: { priceCents: number | null; isFavorite: boolean }[];
}

export function itemPrice(i: PricingInput): PriceInfo {
  if (i.status === "owned") return { kind: "none" };
  if (i.status === "bought" && i.pricePaidCents !== null) return { kind: "paid", cents: i.pricePaidCents };
  const favorite = i.ideas.find((idea) => idea.isFavorite && idea.priceCents !== null);
  if (favorite) return { kind: "favorite", cents: favorite.priceCents! * i.quantity };
  if (i.ownPriceCents !== null) return { kind: "own", cents: i.ownPriceCents * i.quantity };
  const prices = i.ideas.flatMap((idea) => (idea.priceCents === null ? [] : [idea.priceCents]));
  if (prices.length > 0) {
    return {
      kind: "range",
      minCents: Math.min(...prices) * i.quantity,
      maxCents: Math.max(...prices) * i.quantity,
    };
  }
  return { kind: "none" };
}

export function plannedCents(i: PricingInput): number {
  const p = itemPrice(i);
  return p.kind === "paid" || p.kind === "favorite" || p.kind === "own" ? p.cents : 0;
}

export function spentCents(i: PricingInput): number {
  return i.status === "bought" && i.pricePaidCents !== null ? i.pricePaidCents : 0;
}

/** Suggested price paid when marking bought: favorite or own unit price × quantity. */
export function defaultPricePaid(i: PricingInput): number | null {
  const favorite = i.ideas.find((idea) => idea.isFavorite && idea.priceCents !== null);
  if (favorite) return favorite.priceCents! * i.quantity;
  if (i.ownPriceCents !== null) return i.ownPriceCents * i.quantity;
  return null;
}
