import { describe, expect, it } from "vitest";
import { formatChf, formatPrice, parseChfInput, withScheme } from "../../src/web/format";

describe("parseChfInput", () => {
  it.each([["19", 1900], ["19,99", 1999], ["19.99", 1999], ["CHF 19,5", 1950], ["19.–", 1900], ["Fr. 19.-", 1900], ["1'190.–", 119000], ["1.190", 119000], ["1,190", 119000], ["1.190,50", 119050], ["1,190.50", 119050]])(
    "parses %s", (s, cents) => expect(parseChfInput(s)).toBe(cents));
  it("empty is null, garbage is invalid", () => {
    expect(parseChfInput("  ")).toBeNull();
    expect(parseChfInput("abc")).toBe("invalid");
    expect(parseChfInput("-5")).toBe("invalid");
  });
});

describe("formatting", () => {
  it("formats prices", () => {
    expect(formatPrice({ kind: "own", cents: 1900 })).toBe("≈ CHF 19.–");
    expect(formatPrice({ kind: "favorite", cents: 119000 })).toBe("CHF 1'190.–");
    expect(formatPrice({ kind: "paid", cents: 74900 })).toBe("CHF 749.–");
    expect(formatPrice({ kind: "range", minCents: 15000, maxCents: 26000 })).toBe("CHF 150–260.–");
    expect(formatPrice({ kind: "none" })).toBe("");
    expect(formatPrice({ kind: "range", minCents: 74900, maxCents: 74900 })).toBe("CHF 749.–");
    expect(formatChf(1999)).toBe("CHF 19.99");
    expect(formatChf(74900)).toBe("CHF 749.–");
  });
});

describe("withScheme", () => {
  it.each([
    ["shop.example/lamp", "https://shop.example/lamp"],
    ["  www.ikea.ch/x ", "https://www.ikea.ch/x"],
    ["https://a.de/x", "https://a.de/x"],
    ["HTTP://a.de", "HTTP://a.de"],
    ["  ", ""],
  ])("turns %j into %j", (s, out) => expect(withScheme(s)).toBe(out));
});
