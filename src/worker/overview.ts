import type { ItemSummary, Overview, OverviewMode, OverviewRow, Person } from "../shared/types";

function computeMode(
  meId: number,
  people: Person[],
  items: ItemSummary[],
  amount: (i: ItemSummary) => number,
): OverviewMode {
  const personRows = new Map<number, OverviewRow>(
    people.map((p) => [p.id, { key: `person:${p.id}`, label: p.name, ownCents: 0, sharedCents: 0 }]),
  );
  const together: OverviewRow = { key: "together", label: "Paid together", ownCents: 0, sharedCents: 0 };
  const unassigned: OverviewRow = { key: "unassigned", label: "Nobody set yet", ownCents: 0, sharedCents: 0 };

  for (const item of items) {
    const cents = amount(item);
    if (item.forPersonId !== null) {
      const row = personRows.get(item.forPersonId);
      if (row) row.ownCents += cents;
    } else if (item.payer.kind === "person") {
      const row = personRows.get(item.payer.personId);
      if (row) row.sharedCents += cents;
    } else if (item.payer.kind === "together") {
      together.sharedCents += cents;
    } else {
      unassigned.sharedCents += cents;
    }
  }

  const mine = personRows.get(meId);
  const ownCents = mine?.ownCents ?? 0;
  const sharedCents = mine?.sharedCents ?? 0;
  return {
    me: { ownCents, sharedCents, totalCents: ownCents + sharedCents },
    rows: [...personRows.values(), together, unassigned],
  };
}

/** Pure: `items` must already be filtered to what the viewer may see. */
export function computeOverview(meId: number, people: Person[], items: ItemSummary[]): Overview {
  return {
    planned: computeMode(meId, people, items, (i) => i.plannedCents),
    spent: computeMode(meId, people, items, (i) => i.spentCents),
  };
}
