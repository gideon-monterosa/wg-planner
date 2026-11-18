import { describe, expect, it } from "vitest";
import { groupByRoom } from "../../src/web/grouping";
import type { ItemSummary, Room } from "../../src/shared/types";

const rooms: Room[] = [
  { id: 1, name: "Kitchen", personId: null, sort: 2 },
  { id: 2, name: "Living room", personId: null, sort: 1 },
  { id: 3, name: "Gideon's room", personId: 7, sort: 3 },
  { id: 4, name: "Lena's room", personId: 8, sort: 4 },
];
let n = 0;
const item = (o: Partial<ItemSummary>): ItemSummary => ({
  id: ++n, name: `i${n}`, roomId: null, forPersonId: null, visibleToAll: false, status: "needed",
  payer: { kind: "none" }, quantity: 1, ideaCount: 0, price: { kind: "none" }, plannedCents: 0, spentCents: 0, canEdit: true, ...o,
});

describe("groupByRoom", () => {
  it("orders rooms by sort and puts no room last", () => {
    const items = [item({ roomId: null }), item({ roomId: 1 }), item({ roomId: 2 })];
    const g = groupByRoom(rooms, items, 7, "all");
    expect(g.map((b) => b.room?.name ?? null)).toEqual(["Living room", "Kitchen", "Gideon's room", null]);
  });

  it("hides empty rooms but always shows my own room under all and mine", () => {
    const items = [item({ roomId: 1 })];
    expect(groupByRoom(rooms, items, 7, "all").map((b) => b.room?.id)).toEqual([1, 3]);
    expect(groupByRoom(rooms, items, 7, "mine").map((b) => b.room?.id)).toEqual([3]);
    expect(groupByRoom(rooms, items, 7, "shared").map((b) => b.room?.id)).toEqual([1]);
    expect(groupByRoom(rooms, items, 7, "needed").map((b) => b.room?.id)).toEqual([1]);
  });

  it("filters shared, mine and still needed", () => {
    const shared = item({ roomId: 1, forPersonId: null, status: "bought" });
    const mine = item({ roomId: 1, forPersonId: 7, status: "owned" });
    const decided = item({ roomId: 1, forPersonId: 8, status: "decided" });
    const all = [shared, mine, decided];
    const ids = (f: "shared" | "mine" | "needed") => groupByRoom(rooms, all, 7, f).flatMap((b) => b.items.map((i) => i.id));
    expect(ids("shared")).toEqual([shared.id]);
    expect(ids("mine")).toEqual([mine.id]);
    expect(ids("needed")).toEqual([decided.id]);
  });

  it("subtotals use planned cents", () => {
    const items = [item({ roomId: 1, plannedCents: 1999 }), item({ roomId: 1, plannedCents: 500, spentCents: 9999 })];
    expect(groupByRoom(rooms, items, 7, "all").find((b) => b.room?.id === 1)?.subtotalCents).toBe(2499);
  });
});
