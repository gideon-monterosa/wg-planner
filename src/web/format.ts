import type { PriceInfo } from "../shared/types.ts";

/** Swiss style amount: 749.– / 19.90 / 1'190.– (apostrophe thousands separator). */
function amount(cents: number): string {
  const francs = Math.floor(cents / 100);
  const rappen = cents % 100;
  const grouped = String(francs).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return rappen === 0 ? `${grouped}.–` : `${grouped}.${String(rappen).padStart(2, "0")}`;
}

export function formatChf(cents: number): string {
  return `CHF ${amount(cents)}`;
}

export function formatPrice(p: PriceInfo): string {
  switch (p.kind) {
    case "paid":
    case "favorite":
      return formatChf(p.cents);
    case "own":
      return `≈ ${formatChf(p.cents)}`;
    case "range":
      if (p.minCents === p.maxCents) return formatChf(p.minCents);
      // currency once: "CHF 150–260.–"
      return `CHF ${amount(p.minCents).replace(/\.–$/, "")}–${amount(p.maxCents)}`;
    case "none":
      return "";
  }
}

/** Trims a pasted link and adds "https://" when it has no scheme ("ikea.ch/x" -> "https://ikea.ch/x"). */
export function withScheme(s: string): string {
  const t = s.trim();
  if (t === "" || /^[a-z][a-z\d+.-]*:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Parses user-typed CHF amounts to cents ("19.90", "19,9", "1'190.–", "CHF 19.-"). "" -> null; garbage/negative -> "invalid". */
export function parseChfInput(s: string): number | null | "invalid" {
  const t = s
    .replace(/CHF|Fr\./gi, "")
    .replace(/[\s'’]/g, "")
    .replace(/[.,]?[-–]$/, "");
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
