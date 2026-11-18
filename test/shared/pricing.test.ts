import { describe, expect, it } from "vitest";
import { defaultPricePaid, itemPrice, plannedCents, spentCents } from "../../src/shared/pricing";

const base = { status: "needed", quantity: 1, ownPriceCents: null, pricePaidCents: null, ideas: [] } as const;

describe("pricing", () => {
  it("owned items have no price", () => {
    expect(itemPrice({ ...base, status: "owned", ownPriceCents: 1900 })).toEqual({ kind: "none" });
    expect(plannedCents({ ...base, status: "owned", ownPriceCents: 1900 })).toBe(0);
  });
  it("bought with price paid wins", () =>
    expect(itemPrice({ ...base, status: "bought", pricePaidCents: 70000, ideas: [{ priceCents: 74900, isFavorite: true }] }))
      .toEqual({ kind: "paid", cents: 70000 }));
  it("favorite beats own price and multiplies by quantity", () =>
    expect(itemPrice({ ...base, quantity: 4, ownPriceCents: 1000, ideas: [{ priceCents: 2500, isFavorite: true }] }))
      .toEqual({ kind: "favorite", cents: 10000 }));
  it("own price when no favorite", () =>
    expect(itemPrice({ ...base, ownPriceCents: 1900 })).toEqual({ kind: "own", cents: 1900 }));
  it("range when ideas but no favorite and no own price, not counted", () => {
    const i = { ...base, ideas: [{ priceCents: 26000, isFavorite: false }, { priceCents: 15000, isFavorite: false }] };
    expect(itemPrice(i)).toEqual({ kind: "range", minCents: 15000, maxCents: 26000 });
    expect(plannedCents(i)).toBe(0);
  });
  it("spent counts only bought items with a price paid", () => {
    expect(spentCents({ ...base, status: "bought", pricePaidCents: 389_00 })).toBe(38900);
    expect(spentCents({ ...base, status: "decided", ownPriceCents: 1900 })).toBe(0);
  });
  it("default price paid is the favorite or own unit price × quantity", () => {
    expect(defaultPricePaid({ ...base, quantity: 2, ownPriceCents: 500 })).toBe(1000);
    expect(defaultPricePaid(base)).toBeNull();
  });
  it("a favorite without a price falls through to the own price", () =>
    expect(itemPrice({ ...base, ownPriceCents: 900, ideas: [{ priceCents: null, isFavorite: true }] }))
      .toEqual({ kind: "own", cents: 900 }));
});
