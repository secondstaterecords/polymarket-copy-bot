"use client";
import { motion } from "framer-motion";

export interface SuitVersion {
  mk: number;
  codename: string;
  status: "RETIRED" | "DEPLOYED" | "TESTING" | "CONCEPT";
  date: string;
  description: string;
  win_rate: number | null;
  net_pnl: number | null;
  sharpe: number | null;
}

const statusColor: Record<string, string> = {
  RETIRED: "text-blood border-blood/40",
  DEPLOYED: "text-gold border-gold/40",
  TESTING: "text-phosphor border-phosphor/40",
  CONCEPT: "text-paper-muted border-paper-muted/40",
};

function fmt(v: number | null, prefix = "", suffix = "") {
  if (v === null || v === undefined) return "--";
  return `${prefix}${v.toFixed(2)}${suffix}`;
}

export default function SuitCard({ v }: { v: SuitVersion }) {
  const sc = statusColor[v.status] ?? "text-paper-muted border-paper-muted/40";

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative rounded-lg border border-paper/[0.06] bg-ink/50 backdrop-blur-xl p-6 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mono text-xs text-paper-muted">MK-{v.mk}</div>
          <div className="display text-2xl text-paper mt-1">{v.codename}</div>
        </div>
        <span className={`mono text-[10px] uppercase tracking-widest border px-2 py-0.5 ${sc}`}>
          {v.status}
        </span>
      </div>

      {/* Date + description */}
      <div className="mono text-[10px] text-paper-muted">{v.date}</div>
      <p className="text-sm text-paper-muted leading-relaxed">{v.description}</p>

      {/* Metrics */}
      <div className="mt-auto grid grid-cols-3 gap-3 border-t border-paper/[0.06] pt-4">
        <div>
          <div className="mono text-[9px] uppercase tracking-wider text-paper-muted">Win Rate</div>
          <div className={`mono text-lg tabular-nums ${(v.win_rate ?? 0) >= 50 ? "text-phosphor" : "text-blood"}`}>
            {v.win_rate !== null ? `${v.win_rate}%` : "--"}
          </div>
        </div>
        <div>
          <div className="mono text-[9px] uppercase tracking-wider text-paper-muted">Net PnL</div>
          <div className={`mono text-lg tabular-nums ${(v.net_pnl ?? 0) >= 0 ? "text-phosphor" : "text-blood"}`}>
            {fmt(v.net_pnl, "$")}
          </div>
        </div>
        <div>
          <div className="mono text-[9px] uppercase tracking-wider text-paper-muted">Sharpe</div>
          <div className={`mono text-lg tabular-nums ${(v.sharpe ?? 0) >= 1 ? "text-gold" : "text-paper"}`}>
            {fmt(v.sharpe)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
