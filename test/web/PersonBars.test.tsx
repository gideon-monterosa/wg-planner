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
  expect(screen.getByText("€248")).toBeInTheDocument();
  expect(screen.queryByText("Paid together")).toBeNull();
  expect(screen.getByText("Nobody set yet")).toBeInTheDocument();
});

it("shows a tooltip on segment focus and a table view", () => {
  render(<PersonBars mode={mode} />);
  fireEvent.focus(screen.getByRole("img", { name: /Gideon · own things/ }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Gideon · own things · €229");
  fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
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
