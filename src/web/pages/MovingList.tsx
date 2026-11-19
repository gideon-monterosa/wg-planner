import { useState } from "react";
import { Link, useLocation } from "wouter";
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
  { value: "mine", label: "Just mine" },
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
  } else if (item.forPersonId !== null) {
    // A personal item is paid by its owner; repeating that adds nothing.
  } else if (item.payer.kind === "person") parts.push(`paid by ${nameOf(item.payer.personId)}`);
  else if (item.payer.kind === "together") parts.push("Together");
  else parts.push("No payer yet");
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
  if (rooms.isError || items.isError) {
    return (
      <div role="alert" className="space-y-3 py-6 text-center">
        <p>Couldn't load the list.</p>
        <button
          type="button"
          onClick={() => {
            void rooms.refetch();
            void items.refetch();
          }}
          className="min-h-11 rounded-lg bg-[var(--accent-fill)] px-4 font-medium text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const meId = me.data.id;
  const groups = groupByRoom(rooms.data, items.data, meId, filter);

  return (
    <div>
      {people.data && people.data.length <= 1 && (
        <Link
          href="/settings"
          className="mb-3 block rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--accent)] hover:underline"
        >
          Add your flatmates and rooms →
        </Link>
      )}
      <QuickAdd rooms={rooms.data} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`min-h-10 rounded-full border px-3.5 py-2 text-sm ${
              filter === f.value
                ? "border-[var(--accent-fill)] bg-[var(--accent-fill)] text-white"
                : "border-[var(--field-border)] hover:bg-[var(--line)]/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {items.data.length === 0 ? (
        <p className="text-[var(--muted)]">Nothing planned yet. Add the first thing you need above.</p>
      ) : groups.length === 0 ? (
        <p className="text-[var(--muted)]">Nothing matches this filter.</p>
      ) : (
        <div className="grid items-start gap-x-4 gap-y-4 lg:grid-cols-2">
          {groups.map((g) => (
            <section
              key={g.room?.id ?? "none"}
              className="md:rounded-xl md:border md:border-[var(--line)] md:bg-[var(--surface)] md:px-3 md:pt-2 md:pb-1"
            >
              <h2 className="flex items-baseline justify-between gap-2 border-b border-[var(--line)] pb-1 text-sm font-semibold">
                <span className="min-w-0 break-words">{g.room?.name ?? "No room"}</span>
                <span className="shrink-0 whitespace-nowrap font-normal tabular-nums text-[var(--muted)]">
                  {formatChf(g.subtotalCents)}
                </span>
              </h2>
              {g.items.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">Nothing here yet.</p>}
              {g.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/items/${item.id}`)}
                  className="flex w-full items-center gap-2 border-b border-[var(--line)] py-2 text-left last:border-b-0 md:rounded md:px-1 md:hover:bg-[var(--line)]/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{item.name}</span>
                      {item.forPersonId === meId && !item.visibleToAll && (
                        <span className="shrink-0 rounded border border-[var(--field-border)] px-1 text-xs text-[var(--muted)]">
                          <span className="sr-only">, </span>only you
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">{subline(item, meId, people.data ?? [])}</span>
                  </span>
                  <span className="shrink-0"><StatusPill status={item.status} /></span>
                  <span className="w-24 shrink-0 whitespace-nowrap text-right text-sm">
                    <PriceLabel price={item.price} />
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
