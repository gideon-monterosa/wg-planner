import { useState } from "react";
import type { OverviewMode, OverviewRow } from "../../shared/types.ts";
import { formatChf } from "../format.ts";

interface Seg { part: string; cents: number; color: string }

function segments(r: OverviewRow): Seg[] {
  if (r.key === "together") return [{ part: "paid together", cents: r.ownCents + r.sharedCents, color: "var(--together)" }];
  if (r.key === "unassigned") return [{ part: "shared, payer not set", cents: r.ownCents + r.sharedCents, color: "var(--unassigned)" }];
  return [
    { part: "own things", cents: r.ownCents, color: "var(--own)" },
    { part: "shared things", cents: r.sharedCents, color: "var(--shared)" },
  ];
}

export default function PersonBars({ mode }: { mode: OverviewMode }) {
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const rows = mode.rows.filter((r) => r.key.startsWith("person:") || r.ownCents + r.sharedCents > 0);
  const max = Math.max(0, ...rows.map((r) => r.ownCents + r.sharedCents));
  if (max === 0) return <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing to count yet.</p>;

  const has = (k: string) => rows.some((r) => r.key === k);
  const legend: [string, string][] = [["Own things", "var(--own)"], ["Shared things they pay", "var(--shared)"]];
  if (has("together")) legend.push(["Shared, paid together", "var(--together)"]);
  if (has("unassigned")) legend.push(["Shared, nobody set yet", "var(--unassigned)"]);

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
          {legend.map(([l, c]) => (
            <li key={l} className="flex items-center gap-1">
              <i aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
            </li>
          ))}
        </ul>
        <button type="button" className="text-xs underline shrink-0" style={{ color: "var(--muted)" }} onClick={() => { setTip(null); setTable((t) => !t); }}>
          {table ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="font-normal py-1">Who</th><th className="font-normal text-right">Own</th>
              <th className="font-normal text-right">Shared</th><th className="font-normal text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-1">{r.label}</td>
                <td className="text-right tabular-nums">{formatChf(r.ownCents)}</td>
                <td className="text-right tabular-nums">{formatChf(r.sharedCents)}</td>
                <td className="text-right tabular-nums">{formatChf(r.ownCents + r.sharedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const total = r.ownCents + r.sharedCents;
            const segs = segments(r).filter((s) => s.cents > 0);
            return (
              <div key={r.key}>
                <div className="text-sm mb-0.5" style={r.key.startsWith("person:") ? undefined : { color: "var(--muted)" }}>{r.label}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0" data-testid="track">
                  <div className="flex gap-[2px] h-3" data-testid="bar" style={{ width: `${(total / max) * 100}%`, minWidth: total > 0 ? 6 : 0 }}>
                    {segs.map((s, i) => {
                      const text = `${r.label} · ${s.part} · ${formatChf(s.cents)}`;
                      return (
                        <div
                          key={s.part}
                          role="img"
                          tabIndex={0}
                          aria-label={text}
                          title={text}
                          onMouseEnter={() => setTip(text)}
                          onMouseLeave={() => setTip(null)}
                          onFocus={() => setTip(text)}
                          onBlur={() => setTip(null)}
                          style={{
                            flex: s.cents,
                            background: s.color,
                            borderRadius: i === segs.length - 1 ? "0 4px 4px 0" : 0,
                          }}
                        />
                      );
                    })}
                  </div>
                  </div>
                  <span className="text-sm tabular-nums shrink-0">{formatChf(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div role="tooltip" className="mt-2 min-h-5 text-xs" style={{ color: "var(--fg)" }}>{tip}</div>
    </div>
  );
}
