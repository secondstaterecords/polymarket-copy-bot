"use client";
import { motion } from "framer-motion";
import type { SuitVersion } from "./SuitCard";

export default function EvolutionTimeline({ versions }: { versions: SuitVersion[] }) {
  if (!versions.length) return null;

  return (
    <div className="relative pl-8">
      {/* Vertical line */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-moss/40" />

      {versions.map((v, i) => (
        <motion.div
          key={v.mk}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.06, duration: 0.5 }}
          className="relative mb-8 last:mb-0"
        >
          {/* Dot */}
          <div
            className={`absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
              v.status === "DEPLOYED"
                ? "bg-gold border-gold"
                : v.status === "TESTING"
                ? "bg-phosphor border-phosphor"
                : v.status === "RETIRED"
                ? "bg-blood/60 border-blood"
                : "bg-moss border-moss"
            }`}
          />

          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
            <div className="mono text-xs text-paper-muted w-20 shrink-0">
              MK-{v.mk}
            </div>
            <div className="display text-lg text-paper">{v.codename}</div>
            <div className="mono text-[10px] text-paper-muted">{v.date}</div>
            <div className="flex gap-4 mono text-xs ml-auto">
              {v.win_rate !== null && (
                <span className={v.win_rate >= 50 ? "text-phosphor" : "text-blood"}>
                  {v.win_rate}% WR
                </span>
              )}
              {v.net_pnl !== null && (
                <span className={v.net_pnl >= 0 ? "text-phosphor" : "text-blood"}>
                  ${v.net_pnl.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
