"use client";
import type { SuitVersion } from "./SuitCard";

interface MetricRow {
  key: string;
  label: string;
  fmt: (v: number | null) => string;
  better: "higher" | "lower";
}

const metrics: MetricRow[] = [
  { key: "trades_placed", label: "Trades Placed", fmt: (v) => v !== null ? String(Math.round(v)) : "--", better: "higher" },
  { key: "win_rate", label: "Win Rate", fmt: (v) => v !== null ? `${v.toFixed(1)}%` : "--", better: "higher" },
  { key: "net_pnl", label: "Net PnL", fmt: (v) => v !== null ? `$${v.toFixed(2)}` : "--", better: "higher" },
  { key: "profit_factor", label: "Profit Factor", fmt: (v) => v !== null ? v.toFixed(2) : "--", better: "higher" },
  { key: "sharpe_ratio", label: "Sharpe Ratio", fmt: (v) => v !== null ? v.toFixed(2) : "--", better: "higher" },
  { key: "brier_score", label: "Brier Score", fmt: (v) => v !== null ? v.toFixed(3) : "--", better: "lower" },
  { key: "max_drawdown", label: "Max Drawdown", fmt: (v) => v !== null ? `${v.toFixed(1)}%` : "--", better: "lower" },
  { key: "avg_return_per_trade", label: "Avg Return / Trade", fmt: (v) => v !== null ? `${v.toFixed(2)}%` : "--", better: "higher" },
  { key: "sortino_ratio", label: "Sortino Ratio", fmt: (v) => v !== null ? v.toFixed(2) : "--", better: "higher" },
  { key: "signal_to_trade_ratio", label: "Signal-to-Trade", fmt: (v) => v !== null ? `${v.toFixed(1)}%` : "--", better: "higher" },
  { key: "tail_ratio", label: "Tail Ratio", fmt: (v) => v !== null ? v.toFixed(2) : "--", better: "higher" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CompareTable({ versions }: { versions: (SuitVersion & Record<string, any>)[] }) {
  if (!versions.length) return null;

  // Find best value per row for highlighting
  function bestIdx(key: string, better: "higher" | "lower") {
    let best = -1;
    let bestVal = better === "higher" ? -Infinity : Infinity;
    versions.forEach((v, i) => {
      const val = v[key] as number | null;
      if (val === null || val === undefined) return;
      if (better === "higher" ? val > bestVal : val < bestVal) {
        bestVal = val;
        best = i;
      }
    });
    return best;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse mono text-sm">
        <thead>
          <tr className="border-b border-paper/10">
            <th className="text-left py-3 pr-6 text-[10px] uppercase tracking-widest text-paper-muted font-normal">
              Metric
            </th>
            {versions.map((v) => (
              <th
                key={v.mk}
                className="text-right py-3 px-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal"
              >
                MK-{v.mk}
              </th>
            ))}
            {versions.length >= 2 && (
              <th className="text-right py-3 pl-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">
                Delta
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const bi = bestIdx(m.key, m.better);
            const first = versions[0]?.[m.key] as number | null;
            const last = versions[versions.length - 1]?.[m.key] as number | null;
            const delta =
              first !== null && first !== undefined && last !== null && last !== undefined
                ? last - first
                : null;

            return (
              <tr key={m.key} className="border-b border-paper/[0.04] hover:bg-moss/10 transition-colors">
                <td className="py-3 pr-6 text-paper-muted">{m.label}</td>
                {versions.map((v, i) => (
                  <td
                    key={v.mk}
                    className={`text-right py-3 px-4 tabular-nums ${i === bi ? "text-gold" : "text-paper"}`}
                  >
                    {m.fmt(v[m.key] as number | null)}
                  </td>
                ))}
                {versions.length >= 2 && (
                  <td
                    className={`text-right py-3 pl-4 tabular-nums ${
                      delta !== null && delta > 0
                        ? "text-phosphor"
                        : delta !== null && delta < 0
                        ? "text-blood"
                        : "text-paper-muted"
                    }`}
                  >
                    {delta !== null
                      ? `${delta >= 0 ? "+" : ""}${m.fmt(delta)}`
                      : "--"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
