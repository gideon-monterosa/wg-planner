import { useState } from "react";
import { useLocation } from "wouter";
import type { ItemSummary, Person } from "../../shared/types.ts";
import { useItems, useMe, usePeople, useRooms } from "../api.ts";
import PriceLabel from "../components/PriceLabel.tsx";
import QuickAdd from "../components/QuickAdd.tsx";
import StatusPill from "../components/StatusPill.tsx";
import { formatChf } from "../format.ts";
import { groupByRoom, type ListFilter } from "../grouping.ts";

const FILTERS: { value: ListFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "shared", label: "Shared" },
  { value: "mine", label: "Mine" },
  { value: "needed", label: "Still needed" },
];

function subline(item: ItemSummary, meId: number, people: Person[]): string {
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? "someone";
  const parts: string[] = [];
  if (item.forPersonId === null) parts.push("Everyone");
  else parts.push(item.forPersonId === meId ? "Just you" : `Just ${nameOf(item.forPersonId)}`);
  parts.push(item.ideaCount === 0 ? "no ideas yet" : item.ideaCount === 1 ? "1 idea" : `${item.ideaCount} ideas`);
  if (item.status === "owned") {
    if (item.payer.kind === "person") parts.push(`${nameOf(item.payer.personId)}'s`);
    else if (item.forPersonId !== null) parts.push(item.forPersonId === meId ? "Yours" : `${nameOf(item.forPersonId)}'s`);
  } else if (item.payer.kind === "person") parts.push(`paid by ${nameOf(item.payer.personId)}`);
  else if (item.payer.kind === "together") parts.push("Together");
  else parts.push("paid by: not set");
  return parts.join(" · ");
}

export default function MovingList() {
  const me = useMe();
  const rooms = useRooms();
  const items = useItems();
  const people = usePeople();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<ListFilter>("all");

  if (!me.data || rooms.isPending || items.isPending) return <p className="text-[var(--muted)]">Loading…</p>;
  if (rooms.isError || items.isError) return <p>Couldn't load the list. Please reload.</p>;

  const meId = me.data.id;
  const groups = groupByRoom(rooms.data, items.data, meId, filter);

  return (
    <div>
      <QuickAdd rooms={rooms.data} />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {items.data.length === 0 ? (
        <p className="text-[var(--muted)]">Nothing planned yet. Add the first thing you need above.</p>
      ) : (
        groups.map((g) => (
          <section key={g.room?.id ?? "none"} className="mb-4">
            <h2 className="flex justify-between border-b border-[var(--line)] pb-1 text-sm font-semibold">
              <span>{g.room?.name ?? "No room"}</span>
              <span className="font-normal tabular-nums text-[var(--muted)]">{formatChf(g.subtotalCents)}</span>
            </h2>
            {g.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/items/${item.id}`)}
                className="flex w-full items-center gap-2 border-b border-[var(--line)] py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {item.name}
                    {item.forPersonId === meId && !item.visibleToAll && (
                      <span className="ml-2 rounded border border-[var(--line)] px-1 text-xs text-[var(--muted)]">only you</span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--muted)]">{subline(item, meId, people.data ?? [])}</span>
                </span>
                <StatusPill status={item.status} />
                <span className="min-w-[4.5rem] text-right text-sm">
                  <PriceLabel price={item.price} />
                </span>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
