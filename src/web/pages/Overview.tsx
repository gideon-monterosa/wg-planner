import { useState } from "react";
import PersonBars from "../components/PersonBars.tsx";
import { useOverview } from "../api.ts";
import { formatChf } from "../format.ts";

const FOOTNOTE = {
  planned:
    "Planned counts what was paid for bought items, otherwise the starred idea's price, otherwise the item's own price. Price ranges and owned items count as zero.",
  spent: "Actually spent counts the price paid for bought items.",
} as const;

export default function Overview() {
  const q = useOverview();
  const [which, setWhich] = useState<"planned" | "spent">("planned");
  if (q.isLoading) return <p className="text-[var(--muted)]">Loading…</p>;
  if (q.isError || !q.data) return <p role="alert">Could not load the overview.</p>;
  const mode = q.data[which];
  const tiles: [string, number][] = [
    ["Your own things", mode.me.ownCents],
    ["Shared things you pay", mode.me.sharedCents],
    ["You in total", mode.me.totalCents],
  ];
  return (
    <div className="max-w-3xl">
      <h1 className="mb-3 text-xl font-semibold">Overview</h1>
      <div role="group" aria-label="Planned or spent" className="mb-4 inline-flex overflow-hidden rounded-lg border border-[var(--field-border)] text-sm">
        {([["planned", "Planned"], ["spent", "Actually spent"]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={which === k}
            onClick={() => setWhich(k)}
            className={`min-h-10 px-3 py-2 ${which === k ? "bg-[var(--accent-fill)] text-white" : "hover:bg-[var(--line)]/40"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {/* Phones: a label/value list. From 640px: three tiles in a row. */}
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tiles.map(([l, c]) => (
          <div
            key={l}
            className="flex items-baseline justify-between gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 sm:block"
          >
            <div className="text-sm text-[var(--muted)] sm:text-xs">{l}</div>
            <div className="text-lg font-semibold whitespace-nowrap tabular-nums sm:text-xl md:text-2xl">{formatChf(c)}</div>
          </div>
        ))}
      </div>
      <PersonBars mode={mode} />
      <p className="mt-4 text-xs text-[var(--muted)]">{FOOTNOTE[which]}</p>
    </div>
  );
}
