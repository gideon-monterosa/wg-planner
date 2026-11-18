import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PriceLabel from "../../src/web/components/PriceLabel";

it("marks own prices as approximate for screen readers too", () => {
  render(<PriceLabel price={{ kind: "own", cents: 1900 }} />);
  expect(screen.getByText("≈ CHF 19.–")).toHaveAttribute("title", "Estimate");
});
