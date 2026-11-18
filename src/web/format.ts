import type { PriceInfo } from "../shared/types.ts";

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const euroWhole = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function formatEuro(cents: number): string {
  return cents % 100 === 0 ? euroWhole.format(cents / 100) : euro.format(cents / 100);
}

export function formatPrice(p: PriceInfo): string {
  switch (p.kind) {
    case "paid":
    case "favorite":
      return formatEuro(p.cents);
    case "own":
      return `≈ ${formatEuro(p.cents)}`;
    case "range":
      if (p.minCents === p.maxCents) return formatEuro(p.minCents);
      // euro sign once: "€150–260"
      return `${formatEuro(p.minCents)}–${formatEuro(p.maxCents).replace(/^€/, "")}`;
    case "none":
      return "";
  }
}

/** Parses user-typed euro amounts to cents. "" -> null; garbage/negative -> "invalid". */
export function parseEuroInput(s: string): number | null | "invalid" {
  const t = s.replace(/[€\s]/g, "");
  if (t === "") return null;
  if (!/^[\d.,]+$/.test(t)) return "invalid";
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  let intPart: string;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const i = Math.max(lastDot, lastComma);
    intPart = t.slice(0, i).replace(/[.,]/g, "");
    frac = t.slice(i + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const i = Math.max(lastDot, lastComma);
    const after = t.slice(i + 1);
    const count = t.split(sep).length - 1;
    if (count > 1 || after.length === 3) {
      if (after.length !== 3) return "invalid";
      intPart = t.replace(/[.,]/g, "");
    } else {
      intPart = t.slice(0, i);
      frac = after;
    }
  } else {
    intPart = t;
  }
  if (!/^\d*$/.test(frac) || frac.length > 2 || (intPart === "" && frac === "")) return "invalid";
  return Number(intPart || "0") * 100 + Number(frac.padEnd(2, "0"));
}
