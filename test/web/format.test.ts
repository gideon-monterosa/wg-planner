import { describe, expect, it } from "vitest";
import { formatEuro, formatPrice, parseEuroInput } from "../../src/web/format";

describe("parseEuroInput", () => {
  it.each([["19", 1900], ["19,99", 1999], ["19.99", 1999], ["€ 19,5", 1950], ["1.190", 119000], ["1,190", 119000], ["1.190,50", 119050], ["1,190.50", 119050]])(
    "parses %s", (s, cents) => expect(parseEuroInput(s)).toBe(cents));
  it("empty is null, garbage is invalid", () => {
    expect(parseEuroInput("  ")).toBeNull();
    expect(parseEuroInput("abc")).toBe("invalid");
    expect(parseEuroInput("-5")).toBe("invalid");
  });
});

describe("formatting", () => {
  it("formats prices", () => {
    expect(formatPrice({ kind: "own", cents: 1900 })).toBe("≈ €19");
    expect(formatPrice({ kind: "favorite", cents: 119000 })).toBe("€1,190");
    expect(formatPrice({ kind: "paid", cents: 74900 })).toBe("€749");
    expect(formatPrice({ kind: "range", minCents: 15000, maxCents: 26000 })).toBe("€150–260");
    expect(formatPrice({ kind: "none" })).toBe("");
    expect(formatEuro(1999)).toBe("€19.99");
    expect(formatEuro(74900)).toBe("€749");
  });
});
