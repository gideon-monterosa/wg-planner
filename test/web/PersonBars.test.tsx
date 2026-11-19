import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PersonBars from "../../src/web/components/PersonBars";

const mode = { me: { ownCents: 22900, sharedCents: 1900, totalCents: 24800 }, rows: [
  { key: "person:1", label: "Gideon", ownCents: 22900, sharedCents: 1900 },
  { key: "together", label: "Paid together", ownCents: 0, sharedCents: 0 },
  { key: "unassigned", label: "Nobody set yet", ownCents: 0, sharedCents: 74900 } ] };

it("renders a bar per person and hides empty together/unassigned rows", () => {
  render(<PersonBars mode={mode} />);
  expect(screen.getByText("Gideon")).toBeInTheDocument();
  expect(screen.getByText("CHF 248.–")).toBeInTheDocument();
  expect(screen.queryByText("Paid together")).toBeNull();
  // Once as the row label and once in the legend, which uses the same words.
  expect(screen.getAllByText("Nobody set yet")).toHaveLength(2);
});

it("shows a tooltip on segment focus and a table view", () => {
  render(<PersonBars mode={mode} />);
  fireEvent.focus(screen.getByRole("img", { name: /Gideon · own things/ }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Gideon · own things · CHF 229.–");
  fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
});

it("shows a tooltip on tap, for touch screens", () => {
  render(<PersonBars mode={mode} />);
  fireEvent.click(screen.getByRole("img", { name: /Gideon · shared things/ }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Gideon · shared things · CHF 19.–");
});

it("hides the legend in table view and drops the CHF prefix from cells", () => {
  render(<PersonBars mode={mode} />);
  expect(screen.getByText("Own things")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.queryByText("Own things")).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Total (CHF)" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "248.–" })).toBeInTheDocument();
});

it("shows an empty message when everything is 0", () => {
  render(<PersonBars mode={{ me: { ownCents: 0, sharedCents: 0, totalCents: 0 }, rows: [{ key: "person:1", label: "Gideon", ownCents: 0, sharedCents: 0 }] }} />);
  expect(screen.getByText("Nothing to count yet.")).toBeInTheDocument();
});

it("scales bar widths relative to the largest row, inside a flexible track", () => {
  render(<PersonBars mode={{ me: { ownCents: 0, sharedCents: 0, totalCents: 0 }, rows: [
    { key: "person:1", label: "A", ownCents: 10000, sharedCents: 0 },
    { key: "person:2", label: "B", ownCents: 5000, sharedCents: 0 } ] }} />);
  const bars = screen.getAllByTestId("bar");
  expect(bars[0].style.width).toBe("100%");
  expect(bars[1].style.width).toBe("50%");
  expect(bars[0].parentElement).toHaveClass("flex-1", "min-w-0");
});
