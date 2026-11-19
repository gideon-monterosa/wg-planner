import { describe, expect, it } from "vitest";
import type { IdeaWithItem, ItemSummary, Room } from "../../src/shared/types";
import { editableItemsByRoom, groupIdeas, isSharedItem } from "../../src/web/ideaGrouping";

const ROOMS: Room[] = [
  { id: 2, name: "Living", personId: null, sort: 2 },
  { id: 1, name: "Kitchen", personId: null, sort: 1 },
];

let nextId = 1;
function idea(over: Partial<IdeaWithItem>): IdeaWithItem {
  return {
    id: nextId++, title: "Idea", url: "", shop: "", priceCents: null, imageUrl: "", notes: "", isFavorite: false,
    itemId: null, itemName: null, roomId: null, itemStatus: null, itemForPersonId: null, itemVisibleToAll: null,
    canEdit: true, canEditItem: false, isMine: true, ...over,
  };
}
const linked = (itemId: number, itemName: string, roomId: number | null, over: Partial<IdeaWithItem> = {}) =>
  idea({ itemId, itemName, roomId, itemStatus: "needed", itemVisibleToAll: false, canEditItem: true, ...over });

const IDEAS: IdeaWithItem[] = [
  linked(10, "Sofa", 2, { title: "Sofa A", isMine: false }),
  linked(11, "Bowls", null, { title: "Bowls" }),
  idea({ title: "Loose lamp" }),
  linked(12, "Pan", 1, { title: "Pan A" }),
  linked(13, "Chair", 99, { title: "Chair in unknown room", isMine: false }),
  linked(12, "Pan", 1, { title: "Pan B", isMine: false }),
  linked(14, "Apron", 1, { title: "Apron" }),
];

describe("groupIdeas", () => {
  it("puts unlinked first, then rooms in room order, and No room last", () => {
    const g = groupIdeas(ROOMS, IDEAS, "all", 1);
    expect(g.unlinked.map((i) => i.title)).toEqual(["Loose lamp"]);
    expect(g.rooms.map((r) => r.room?.name ?? "No room")).toEqual(["Kitchen", "Living", "No room"]);
    expect(g.rooms[0].items.map((i) => i.itemName)).toEqual(["Apron", "Pan"]);
    expect(g.rooms[0].items[1].ideas.map((i) => i.title)).toEqual(["Pan A", "Pan B"]);
    // An unknown room counts as No room.
    expect(g.rooms[2].items.map((i) => i.itemName)).toEqual(["Bowls", "Chair"]);
  });

  it("filters to unlinked ideas only", () => {
    const g = groupIdeas(ROOMS, IDEAS, "unlinked", 1);
    expect(g.unlinked).toHaveLength(1);
    expect(g.rooms).toEqual([]);
  });

  it("filters to my ideas", () => {
    const g = groupIdeas(ROOMS, IDEAS, "mine", 1);
    expect(g.unlinked.map((i) => i.title)).toEqual(["Loose lamp"]);
    expect(g.rooms.map((r) => r.room?.name ?? "No room")).toEqual(["Kitchen", "No room"]);
    expect(g.rooms[0].items.find((i) => i.itemName === "Pan")!.ideas.map((i) => i.title)).toEqual(["Pan A"]);
  });

  it("marks my hidden personal items", () => {
    const g = groupIdeas(ROOMS, [linked(20, "Bed", 1, { itemForPersonId: 1, itemVisibleToAll: false })], "all", 1);
    expect(g.rooms[0].items[0].hidden).toBe(true);
  });

  it("is empty without ideas", () => {
    expect(groupIdeas(ROOMS, [], "all", 1)).toEqual({ unlinked: [], rooms: [] });
  });
});

describe("editableItemsByRoom", () => {
  const item = (id: number, name: string, roomId: number | null, canEdit = true) =>
    ({ id, name, roomId, canEdit, forPersonId: null, visibleToAll: false }) as ItemSummary;
  it("groups editable items by room order, No room last", () => {
    const groups = editableItemsByRoom(ROOMS, [item(1, "Sofa", 2), item(2, "Pan", 1), item(3, "Hidden", 1, false), item(4, "Mat", null)]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([
      ["Kitchen", ["Pan"]],
      ["Living", ["Sofa"]],
      ["No room", ["Mat"]],
    ]);
  });
  it("leaves out owned items, since the modal hides their ideas", () => {
    const owned = { ...item(5, "Kettle", 1), status: "owned" } as ItemSummary;
    const bought = { ...item(6, "Toaster", 1), status: "bought" } as ItemSummary;
    expect(editableItemsByRoom(ROOMS, [owned, bought]).map((g) => g.items.map((i) => i.name))).toEqual([["Toaster"]]);
  });
  it("knows shared items", () => {
    expect(isSharedItem({ forPersonId: null, visibleToAll: false })).toBe(true);
    expect(isSharedItem({ forPersonId: 1, visibleToAll: true })).toBe(true);
    expect(isSharedItem({ forPersonId: 1, visibleToAll: false })).toBe(false);
  });
});
