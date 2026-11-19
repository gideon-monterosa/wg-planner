import type { IdeaWithItem, ItemSummary, Room } from "../shared/types.ts";

export type IdeaFilter = "all" | "unlinked" | "mine";

export interface IdeaItemGroup {
  itemId: number;
  itemName: string;
  /** May star ideas on this item. */
  canEditItem: boolean;
  /** Personal and hidden from the others. */
  hidden: boolean;
  ideas: IdeaWithItem[];
}

export interface IdeaRoomGroup {
  /** null is "No room" (no room, or a room the viewer doesn't know). */
  room: Room | null;
  items: IdeaItemGroup[];
}

export interface GroupedIdeas {
  /** "Not linked yet": shown first. */
  unlinked: IdeaWithItem[];
  /** Room order, "No room" last; inside a room, items by name. */
  rooms: IdeaRoomGroup[];
}

function matches(idea: IdeaWithItem, filter: IdeaFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unlinked":
      return idea.itemId === null;
    case "mine":
      return idea.isMine;
  }
}

const byName = (a: IdeaItemGroup, b: IdeaItemGroup) =>
  a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base" }) || a.itemId - b.itemId;

/** Groups visible ideas for the Ideas tab: unlinked first, then room → item. Pure. */
export function groupIdeas(rooms: Room[], ideas: IdeaWithItem[], filter: IdeaFilter, meId: number): GroupedIdeas {
  const filtered = ideas.filter((i) => matches(i, filter));
  const unlinked = filtered.filter((i) => i.itemId === null);

  const known = new Set(rooms.map((r) => r.id));
  const byRoom = new Map<number | null, Map<number, IdeaItemGroup>>();
  for (const idea of filtered) {
    if (idea.itemId === null) continue;
    const roomKey = idea.roomId !== null && known.has(idea.roomId) ? idea.roomId : null;
    let items = byRoom.get(roomKey);
    if (!items) byRoom.set(roomKey, (items = new Map()));
    let group = items.get(idea.itemId);
    if (!group) {
      group = {
        itemId: idea.itemId,
        itemName: idea.itemName ?? "",
        canEditItem: idea.canEditItem,
        hidden: idea.itemForPersonId === meId && idea.itemVisibleToAll === false,
        ideas: [],
      };
      items.set(idea.itemId, group);
    }
    group.ideas.push(idea);
  }

  const result: IdeaRoomGroup[] = [];
  for (const room of [...rooms].sort((a, b) => a.sort - b.sort)) {
    const items = byRoom.get(room.id);
    if (items) result.push({ room, items: [...items.values()].sort(byName) });
  }
  const loose = byRoom.get(null);
  if (loose) result.push({ room: null, items: [...loose.values()].sort(byName) });
  return { unlinked, rooms: result };
}

export interface ItemOptionGroup {
  label: string;
  items: ItemSummary[];
}

/**
 * Items the viewer may edit (link, capture and move targets), as `<optgroup>`s in room order with "No room" last.
 * Owned items are left out: the item modal hides their ideas.
 */
export function editableItemsByRoom(rooms: Room[], items: ItemSummary[]): ItemOptionGroup[] {
  const editable = items
    .filter((i) => i.canEdit && i.status !== "owned")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id);
  const known = new Set(rooms.map((r) => r.id));
  const groups: ItemOptionGroup[] = [];
  for (const room of [...rooms].sort((a, b) => a.sort - b.sort)) {
    const inRoom = editable.filter((i) => i.roomId === room.id);
    if (inRoom.length > 0) groups.push({ label: room.name, items: inRoom });
  }
  const loose = editable.filter((i) => i.roomId === null || !known.has(i.roomId));
  if (loose.length > 0) groups.push({ label: "No room", items: loose });
  return groups;
}

/** Whether an item is seen by others too (everyone's, or personal but shown to everyone). */
export const isSharedItem = (item: Pick<ItemSummary, "forPersonId" | "visibleToAll">) =>
  item.forPersonId === null || item.visibleToAll;
