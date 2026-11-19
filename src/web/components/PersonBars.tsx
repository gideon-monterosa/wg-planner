import { useState } from "react";
import type { OverviewMode, OverviewRow } from "../../shared/types.ts";
import { formatChf } from "../format.ts";

interface Seg { part: string; cents: number; color: string }

// Legend labels and segment names use the same words as the together/unassigned rows.
const OWN = "Own things";
const SHARED = "Shared things they pay";
const TOGETHER = "Paid together";
const UNASSIGNED = "Nobody set yet";

function segments(r: OverviewRow): Seg[] {
  if (r.key === "together") return [{ part: TOGETHER.toLowerCase(), cents: r.ownCents + r.sharedCents, color: "var(--together)" }];
  if (r.key === "unassigned") return [{ part: UNASSIGNED.toLowerCase(), cents: r.ownCents + r.sharedCents, color: "var(--unassigned)" }];
  return [
    { part: "own things", cents: r.ownCents, color: "var(--own)" },
    { part: "shared things", cents: r.sharedCents, color: "var(--shared)" },
  ];
}

/** Amount without the "CHF " prefix, for table cells under a "(CHF)" header. */
const bare = (cents: number) => formatChf(cents).replace(/^CHF /, "");

export default function PersonBars({ mode }: { mode: OverviewMode }) {
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const rows = mode.rows.filter((r) => r.key.startsWith("person:") || r.ownCents + r.sharedCents > 0);
  const max = Math.max(0, ...rows.map((r) => r.ownCents + r.sharedCents));
  if (max === 0) return <p className="text-sm text-[var(--muted)]">Nothing to count yet.</p>;

  const has = (k: string) => rows.some((r) => r.key === k);
  const legend: [string, string][] = [[OWN, "var(--own)"], [SHARED, "var(--shared)"]];
  if (has("together")) legend.push([TOGETHER, "var(--together)"]);
  if (has("unassigned")) legend.push([UNASSIGNED, "var(--unassigned)"]);

  const num = "pl-3 text-right whitespace-nowrap tabular-nums";
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        {table ? <span /> : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            {legend.map(([l, c]) => (
              <li key={l} className="flex items-center gap-1">
                <i aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="-my-2 shrink-0 rounded px-1 py-2 text-xs text-[var(--muted)] underline"
          onClick={() => { setTip(null); setTable((t) => !t); }}
        >
          {table ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="py-1 font-normal">Who</th>
              <th className={`${num} font-normal`}>Own</th>
              <th className={`${num} font-normal`}>Shared</th>
              <th className={`${num} font-normal`}>Total (CHF)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--line)]">
                <td className="py-1 break-words">{r.label}</td>
                <td className={num}>{bare(r.ownCents)}</td>
                <td className={num}>{bare(r.sharedCents)}</td>
                <td className={num}>{bare(r.ownCents + r.sharedCents)}</td>
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
                <div className={`mb-0.5 text-sm ${r.key.startsWith("person:") ? "" : "text-[var(--muted)]"}`}>{r.label}</div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1" data-testid="track">
                    {total === 0 ? (
                      <div className="h-px bg-[var(--line)]" data-testid="bar" style={{ width: "100%" }} />
                    ) : (
                      <div className="flex h-4 gap-[2px]" data-testid="bar" style={{ width: `${(total / max) * 100}%`, minWidth: 6 }}>
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
                              onClick={() => setTip(text)}
                              style={{
                                flex: s.cents,
                                background: s.color,
                                borderRadius: i === segs.length - 1 ? "0 4px 4px 0" : 0,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-sm whitespace-nowrap tabular-nums">{formatChf(total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div role="tooltip" className="mt-2 min-h-5 text-xs text-[var(--fg)]">{tip}</div>
    </div>
  );
}
