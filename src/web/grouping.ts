import type { ItemSummary, Room } from "../shared/types.ts";

export type ListFilter = "all" | "shared" | "mine" | "needed";

export interface RoomGroup {
  room: Room | null;
  items: ItemSummary[];
  subtotalCents: number;
}

function matches(item: ItemSummary, meId: number, filter: ListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "shared":
      return item.forPersonId === null;
    case "mine":
      return item.forPersonId === meId;
    case "needed":
      return item.status === "needed" || item.status === "decided";
  }
}

const sum = (items: ItemSummary[]) => items.reduce((s, i) => s + i.plannedCents, 0);

export function groupByRoom(rooms: Room[], items: ItemSummary[], meId: number, filter: ListFilter): RoomGroup[] {
  const filtered = items.filter((i) => matches(i, meId, filter));
  const groups: RoomGroup[] = [];
  for (const room of [...rooms].sort((a, b) => a.sort - b.sort)) {
    const inRoom = filtered.filter((i) => i.roomId === room.id);
    const showEmpty = room.personId === meId && (filter === "all" || filter === "mine");
    if (inRoom.length > 0 || showEmpty) groups.push({ room, items: inRoom, subtotalCents: sum(inRoom) });
  }
  const known = new Set(rooms.map((r) => r.id));
  const loose = filtered.filter((i) => i.roomId === null || !known.has(i.roomId));
  if (loose.length > 0) groups.push({ room: null, items: loose, subtotalCents: sum(loose) });
  return groups;
}
