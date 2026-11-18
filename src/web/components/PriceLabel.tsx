import type { PriceInfo } from "../../shared/types.ts";
import { formatPrice } from "../format.ts";

export default function PriceLabel({ price }: { price: PriceInfo }) {
  const text = formatPrice(price);
  if (!text) return null;
  return (
    <span className="tabular-nums" title={price.kind === "own" ? "Estimate" : undefined}>
      {text}
    </span>
  );
}
