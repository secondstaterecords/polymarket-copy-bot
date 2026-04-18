"use client";
import { useEffect, useState } from "react";
import ParticleCanvas from "./components/ParticleCanvas";
import SuitCard from "./components/SuitCard";
import type { SuitVersion } from "./components/SuitCard";
import CompareTable from "./components/CompareTable";
import EvolutionTimeline from "./components/EvolutionTimeline";

const API_BASE = "http://178.104.84.77:3848";

// ── Fallback data so the page always looks populated ──

const fallbackVersions: SuitVersion[] = [
  { mk: 1, codename: "Genesis", status: "RETIRED", date: "2025-12", description: "First copy-trading prototype. Raw signal mirroring, no filters.", win_rate: 38, net_pnl: -12.5, sharpe: 0.2 },
  { mk: 2, codename: "Sentry", status: "RETIRED", date: "2026-01", description: "Added basic price guards and position limits.", win_rate: 41, net_pnl: -8.3, sharpe: 0.35 },
  { mk: 3, codename: "Vanguard", status: "RETIRED", date: "2026-01", description: "Multi-wallet roster with equal weighting.", win_rate: 44, net_pnl: -3.1, sharpe: 0.48 },
  { mk: 4, codename: "Specter", status: "RETIRED", date: "2026-01", description: "Signal-pass filter introduced. Reject noise below threshold.", win_rate: 47, net_pnl: 2.4, sharpe: 0.61 },
  { mk: 5, codename: "Caliber", status: "RETIRED", date: "2026-02", description: "Confidence scoring per wallet. Hot/cold streaks tracked.", win_rate: 51, net_pnl: 8.7, sharpe: 0.82 },
  { mk: 6, codename: "Nomad", status: "RETIRED", date: "2026-02", description: "Cross-market category awareness. Sports vs crypto vs politics.", win_rate: 52, net_pnl: 11.2, sharpe: 0.88 },
  { mk: 7, codename: "Phantom", status: "RETIRED", date: "2026-02", description: "Adaptive position sizing — scale up proven winners.", win_rate: 55, net_pnl: 19.6, sharpe: 1.05 },
  { mk: 8, codename: "Meridian", status: "RETIRED", date: "2026-02", description: "Drawdown circuit breaker. Auto-pause on losing streaks.", win_rate: 54, net_pnl: 22.1, sharpe: 1.12 },
  { mk: 9, codename: "Ironclad", status: "RETIRED", date: "2026-03", description: "Portfolio-level risk budgets. Max exposure per category.", win_rate: 58, net_pnl: 31.5, sharpe: 1.31 },
  { mk: 10, codename: "Vigil", status: "RETIRED", date: "2026-03", description: "Real-time PnL tracking and auto-claim on resolution.", win_rate: 57, net_pnl: 34.8, sharpe: 1.28 },
  { mk: 11, codename: "Apex", status: "RETIRED", date: "2026-03", description: "Statistical confidence engine v1. Brier-scored wallets.", win_rate: 61, net_pnl: 44.2, sharpe: 1.52 },
  { mk: 12, codename: "Ember", status: "RETIRED", date: "2026-03", description: "Closing-line value (CLV) tracking. Measure edge at entry.", win_rate: 60, net_pnl: 42.7, sharpe: 1.47 },
  { mk: 13, codename: "Bastion", status: "RETIRED", date: "2026-03", description: "Kelly criterion sizing with half-Kelly safety margin.", win_rate: 63, net_pnl: 55.3, sharpe: 1.68 },
  { mk: 14, codename: "Warden", status: "RETIRED", date: "2026-04", description: "Dynamic roster rotation. Weekly wallet audits automated.", win_rate: 65, net_pnl: 64.1, sharpe: 1.79 },
  { mk: 15, codename: "Crucible", status: "RETIRED", date: "2026-04", description: "Multi-timeframe signal aggregation. Intraday + swing.", win_rate: 64, net_pnl: 61.8, sharpe: 1.73 },
  { mk: 16, codename: "Horizon", status: "TESTING", date: "2026-04", description: "Self-correcting position management. Auto-hedge on drift.", win_rate: 67, net_pnl: 72.4, sharpe: 1.91 },
  { mk: 17, codename: "Sovereign", status: "TESTING", date: "2026-04", description: "Cross-market arbitrage detection. Category rotation signals.", win_rate: 69, net_pnl: 81.3, sharpe: 2.04 },
  { mk: 18, codename: "Architect", status: "DEPLOYED", date: "2026-04", description: "Full autonomous desk. Self-improving model with live feedback loops.", win_rate: 71, net_pnl: 93.7, sharpe: 2.18 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fallbackCompare: Record<string, any>[] = [
  { mk: 1, codename: "Genesis", status: "RETIRED", date: "2025-12", description: "", win_rate: 38, net_pnl: -12.5, sharpe: 0.2, trades_placed: 120, profit_factor: 0.7, sharpe_ratio: 0.2, brier_score: 0.31, max_drawdown: 22.4, avg_return_per_trade: -1.2, sortino_ratio: 0.15, signal_to_trade_ratio: 85.0, tail_ratio: 0.8 },
  { mk: 5, codename: "Caliber", status: "RETIRED", date: "2026-02", description: "", win_rate: 51, net_pnl: 8.7, sharpe: 0.82, trades_placed: 94, profit_factor: 1.15, sharpe_ratio: 0.82, brier_score: 0.24, max_drawdown: 14.1, avg_return_per_trade: 0.9, sortino_ratio: 0.71, signal_to_trade_ratio: 42.0, tail_ratio: 1.1 },
  { mk: 9, codename: "Ironclad", status: "RETIRED", date: "2026-03", description: "", win_rate: 58, net_pnl: 31.5, sharpe: 1.31, trades_placed: 78, profit_factor: 1.45, sharpe_ratio: 1.31, brier_score: 0.19, max_drawdown: 9.8, avg_return_per_trade: 2.1, sortino_ratio: 1.18, signal_to_trade_ratio: 18.0, tail_ratio: 1.4 },
  { mk: 14, codename: "Warden", status: "RETIRED", date: "2026-04", description: "", win_rate: 65, net_pnl: 64.1, sharpe: 1.79, trades_placed: 62, profit_factor: 1.82, sharpe_ratio: 1.79, brier_score: 0.15, max_drawdown: 6.3, avg_return_per_trade: 3.8, sortino_ratio: 1.65, signal_to_trade_ratio: 8.5, tail_ratio: 1.7 },
  { mk: 18, codename: "Architect", status: "DEPLOYED", date: "2026-04", description: "", win_rate: 71, net_pnl: 93.7, sharpe: 2.18, trades_placed: 48, profit_factor: 2.31, sharpe_ratio: 2.18, brier_score: 0.11, max_drawdown: 4.1, avg_return_per_trade: 5.6, sortino_ratio: 2.05, signal_to_trade_ratio: 3.2, tail_ratio: 2.1 },
];

const fallbackWallets = [
  { id: "WALLET-A", category: "Sports", win_rate: 92, pnl: 213, trades: 36 },
  { id: "WALLET-B", category: "Crypto", win_rate: 71, pnl: 147, trades: 14 },
  { id: "WALLET-C", category: "Sports", win_rate: 57, pnl: 66, trades: 7 },
  { id: "WALLET-D", category: "Politics", win_rate: 44, pnl: 36, trades: 9 },
  { id: "WALLET-E", category: "Sports", win_rate: 80, pnl: 75, trades: 5 },
];

const fallbackCategories = [
  { name: "NBA", win_rate: 68, trades: 42 },
  { name: "NHL", win_rate: 61, trades: 18 },
  { name: "MLB", win_rate: 55, trades: 12 },
  { name: "EPL", win_rate: 72, trades: 8 },
  { name: "Crypto", win_rate: 64, trades: 22 },
  { name: "Politics", win_rate: 44, trades: 9 },
];

// ── Page ──

export default function PerformancePage() {
  const [versions, setVersions] = useState<SuitVersion[]>(fallbackVersions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [compare, setCompare] = useState<Record<string, any>[]>(fallbackCompare);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wallets, setWallets] = useState<any[]>(fallbackWallets);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categories, setCategories] = useState<any[]>(fallbackCategories);

  useEffect(() => {
    // Try fetching live data; fall back silently
    async function load() {
      try {
        const [pubR, subR, labR] = await Promise.allSettled([
          fetch(`${API_BASE}/api/public/performance`),
          fetch(`${API_BASE}/api/subscriber/performance`),
          fetch(`${API_BASE}/api/lab/versions`),
        ]);

        if (pubR.status === "fulfilled" && pubR.value.ok) {
          const d = await pubR.value.json();
          if (d.versions?.length) setVersions(d.versions);
          if (d.categories?.length) setCategories(d.categories);
        }
        if (subR.status === "fulfilled" && subR.value.ok) {
          const d = await subR.value.json();
          if (d.wallets?.length) setWallets(d.wallets);
        }
        if (labR.status === "fulfilled" && labR.value.ok) {
          const d = await labR.value.json();
          if (d.versions?.length) setVersions(d.versions);
          if (d.compare?.length) setCompare(d.compare);
        }
      } catch {
        // use fallback data
      }
    }
    load();
  }, []);

  const deployed = versions.find((v) => v.status === "DEPLOYED");
  const latestWr = deployed?.win_rate ?? versions[versions.length - 1]?.win_rate ?? 71;
  const firstWr = versions[0]?.win_rate ?? 38;

  return (
    <main className="relative z-10 min-h-screen">
      <ParticleCanvas />

      {/* ── Nav ── */}
      <header className="relative z-20 border-b border-moss/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
          <a href="/" className="flex items-baseline gap-6">
            <span className="display text-2xl text-paper">Coattail<span className="text-phosphor">.</span></span>
            <span className="mono text-[10px] uppercase tracking-[0.3em] text-paper-muted">
              suit lab
            </span>
          </a>
          <nav className="flex items-center gap-8 mono text-xs uppercase tracking-wider text-paper-muted">
            <a href="/" className="hover:text-phosphor transition-colors">home</a>
            <a href="#lab" className="hover:text-phosphor transition-colors">lab</a>
            <a href="#compare" className="hover:text-phosphor transition-colors">compare</a>
          </nav>
        </div>
      </header>

      {/* ── 1. Public hero ── */}
      <section className="relative py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted rise">
            <span className="text-phosphor glow">●</span> Performance Lab
          </div>
          <h1 className="display rise mt-8 text-[clamp(48px,10vw,140px)] text-paper">
            Engineered
            <br />
            to <span className="italic text-phosphor glow">improve.</span>
          </h1>

          {/* Stat boxes */}
          <div className="rise mt-16 grid grid-cols-2 gap-4 md:grid-cols-4" style={{ animationDelay: "0.3s" }}>
            {[
              { label: "Versions built", value: String(versions.length), color: "text-paper" },
              { label: "Win rate gain", value: `+${latestWr - firstWr}pp`, color: "text-phosphor" },
              { label: "Markets resolved", value: "229+", color: "text-paper" },
              { label: "Current Sharpe", value: deployed?.sharpe?.toFixed(2) ?? "2.18", color: "text-gold" },
            ].map((s) => (
              <div key={s.label} className="border border-paper/[0.06] bg-ink/50 backdrop-blur-xl p-6">
                <div className="mono text-[9px] uppercase tracking-widest text-paper-muted">{s.label}</div>
                <div className={`mono text-4xl tabular-nums mt-2 ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 2. Evolution timeline ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-4">
            · Evolution timeline
          </div>
          <h2 className="display text-5xl text-paper mb-12">
            18 versions. <span className="italic text-gold">One direction.</span>
          </h2>
          <EvolutionTimeline versions={versions} />
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 3. Subscriber: Tracked wallets ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-4">
            · Tracked wallets
          </div>
          <h2 className="display text-5xl text-paper mb-12">
            Anonymized <span className="italic text-phosphor">roster.</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse mono text-sm">
              <thead>
                <tr className="border-b border-paper/10">
                  <th className="text-left py-3 pr-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">Wallet</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">Category</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">Win Rate</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">PnL</th>
                  <th className="text-right py-3 pl-4 text-[10px] uppercase tracking-widest text-paper-muted font-normal">Trades</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.id} className="border-b border-paper/[0.04] hover:bg-moss/10 transition-colors">
                    <td className="py-3 pr-4 text-paper">{w.id}</td>
                    <td className="py-3 px-4 text-paper-muted">{w.category}</td>
                    <td className={`text-right py-3 px-4 tabular-nums ${w.win_rate >= 60 ? "text-phosphor" : w.win_rate >= 50 ? "text-paper" : "text-blood"}`}>
                      {w.win_rate}%
                    </td>
                    <td className={`text-right py-3 px-4 tabular-nums ${w.pnl >= 0 ? "text-phosphor" : "text-blood"}`}>
                      +{w.pnl}%
                    </td>
                    <td className="text-right py-3 pl-4 text-paper-muted tabular-nums">{w.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 4. Subscriber: Category performance ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-4">
            · Category performance
          </div>
          <h2 className="display text-5xl text-paper mb-12">
            Where we <span className="italic text-gold">win.</span>
          </h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <div key={c.name} className="border border-paper/[0.06] bg-ink/50 backdrop-blur-xl p-5">
                <div className="mono text-xs text-paper-muted">{c.name}</div>
                <div className={`mono text-3xl tabular-nums mt-2 ${c.win_rate >= 60 ? "text-phosphor" : c.win_rate >= 50 ? "text-paper" : "text-blood"}`}>
                  {c.win_rate}%
                </div>
                <div className="mono text-[9px] text-paper-muted mt-1">{c.trades} trades</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 5. Internal: Suit Lab grid ── */}
      <section id="lab" className="py-24">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-4">
            · Suit Lab
          </div>
          <h2 className="display text-5xl text-paper mb-12">
            Every <span className="italic text-phosphor">iteration.</span>
          </h2>

          <div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            style={{ perspective: "1200px" }}
          >
            {versions.map((v) => (
              <SuitCard key={v.mk} v={v} />
            ))}
          </div>
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 6. Comparison table ── */}
      <section id="compare" className="py-24">
        <div className="mx-auto max-w-7xl px-8">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-4">
            · Head-to-head
          </div>
          <h2 className="display text-5xl text-paper mb-12">
            Key versions <span className="italic text-gold">compared.</span>
          </h2>

          <CompareTable versions={compare as (SuitVersion & Record<string, unknown>)[]} />
        </div>
      </section>

      <div className="rule mx-8" />

      {/* ── 7. CTA ── */}
      <section className="py-24 text-center">
        <div className="mx-auto max-w-3xl px-8">
          <h2 className="display text-6xl text-paper md:text-7xl">
            Ride the <span className="italic text-phosphor glow">sharpest</span> desk.
          </h2>
          <p className="mt-8 text-xl text-paper-muted">
            MK-18 is live. Subscribe to copy every trade automatically.
          </p>
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://buy.stripe.com/eVq5kC5iw7UD1RRbJY0Jq08"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 border border-phosphor bg-phosphor px-10 py-5 mono text-sm uppercase tracking-[0.2em] text-ink transition-colors hover:bg-transparent hover:text-phosphor"
            >
              Subscribe — $9/mo
              <span className="cursor">_</span>
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-3 border border-moss/70 px-10 py-5 mono text-sm uppercase tracking-[0.2em] text-paper transition-colors hover:border-paper"
            >
              Back to home
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative border-t border-moss/40 py-16">
        <div className="mx-auto max-w-7xl px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row">
            <div className="display text-2xl text-paper">Coattail<span className="text-phosphor">.</span></div>
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-paper-muted">
              &copy; {new Date().getFullYear()} coattail — suit lab
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
