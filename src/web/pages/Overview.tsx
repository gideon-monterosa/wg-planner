import { useState } from "react";
import PersonBars from "../components/PersonBars.tsx";
import { useOverview } from "../api.ts";
import { formatChf } from "../format.ts";

export default function Overview() {
  const q = useOverview();
  const [which, setWhich] = useState<"planned" | "spent">("planned");
  if (q.isLoading) return <p>Loading…</p>;
  if (q.isError || !q.data) return <p>Could not load the overview.</p>;
  const mode = q.data[which];
  const tiles: [string, number][] = [
    ["Your own things", mode.me.ownCents],
    ["Shared things you pay", mode.me.sharedCents],
    ["You in total", mode.me.totalCents],
  ];
  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Overview</h1>
      <div role="group" aria-label="Planned or spent" className="inline-flex rounded-lg border mb-4 overflow-hidden text-sm" style={{ borderColor: "var(--line)" }}>
        {([["planned", "Planned"], ["spent", "Actually spent"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={which === k} onClick={() => setWhich(k)} className="px-3 py-1.5"
            style={which === k ? { background: "var(--accent)", color: "#fff" } : undefined}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {tiles.map(([l, c]) => (
          <div key={l} className="rounded-[10px] border p-2.5" style={{ borderColor: "var(--line)" }}>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>{l}</div>
            <div className="text-xl font-semibold tabular-nums">{formatChf(c)}</div>
          </div>
        ))}
      </div>
      <PersonBars mode={mode} />
      <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
        Planned counts what was paid for bought items, otherwise the starred idea's price, otherwise the item's own price. Price ranges and owned items count as zero.
      </p>
    </div>
  );
}
