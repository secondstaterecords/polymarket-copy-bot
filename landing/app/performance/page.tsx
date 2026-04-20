"use client";
import { useEffect, useState } from "react";
import ParticleCanvas from "./components/ParticleCanvas";
import SuitCard from "./components/SuitCard";
import type { SuitVersion } from "./components/SuitCard";
import CompareTable from "./components/CompareTable";
import EvolutionTimeline from "./components/EvolutionTimeline";

const API_BASE = "http://178.104.84.77:3848";

// Minimum sample size before we publish a WR number as "real"
const MIN_RESOLVED_FOR_PUBLISH = 20;

// Empty initial state — page shows "re-baselining" banners until API populates.
// No fallback fictional data. Honest numbers or honest absence.
const emptyVersions: SuitVersion[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emptyCompare: Record<string, any>[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emptyWallets: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emptyCategories: any[] = [];

// ── Page ──

export default function PerformancePage() {
  const [versions, setVersions] = useState<SuitVersion[]>(emptyVersions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [compare, setCompare] = useState<Record<string, any>[]>(emptyCompare);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wallets, setWallets] = useState<any[]>(emptyWallets);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [categories, setCategories] = useState<any[]>(emptyCategories);
  const [dataState, setDataState] = useState<"loading" | "live" | "insufficient" | "error">("loading");

  // Access tiers via URL params:
  //   /performance           → public only
  //   /performance?sub=1     → public + subscriber
  //   /performance?key=coattail2026  → public + subscriber + internal (full lab)
  const [tier, setTier] = useState<"public" | "subscriber" | "internal">("public");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("key") === "coattail2026") setTier("internal");
    else if (params.get("sub") === "1") setTier("subscriber");
  }, []);

  useEffect(() => {
    // Try fetching live data; fall back silently
    async function load() {
      try {
        const [pubR, subR, labR] = await Promise.allSettled([
          fetch(`${API_BASE}/api/public/performance`),
          fetch(`${API_BASE}/api/subscriber/performance`),
          fetch(`${API_BASE}/api/lab/versions`),
        ]);

        let totalResolved = 0;
        if (subR.status === "fulfilled" && subR.value.ok) {
          const d = await subR.value.json();
          if (d.traderLeaderboard?.length) setWallets(d.traderLeaderboard);
          if (d.categoryPerformance?.length) setCategories(d.categoryPerformance);
          if (d.versionHistory?.length) {
            setVersions(d.versionHistory.map((v: any) => ({
              mk: v.mk, codename: v.codename, date: v.date,
              description: v.description,
              status: (v.status || "retired").toUpperCase(),
              win_rate: v.winRate ?? null, net_pnl: v.netPnl ?? null, sharpe: v.sharpe ?? null,
              resolved: v.resolved ?? null,
            })));
          }
        }
        if (labR.status === "fulfilled" && labR.value.ok) {
          const d = await labR.value.json();
          if (Array.isArray(d) && d.length) {
            setVersions(d.map((v: any) => ({
              mk: v.mk, codename: v.codename, date: v.date,
              description: v.description,
              status: (v.status || "retired").toUpperCase(),
              win_rate: v.metrics?.win_rate?.value ?? null,
              net_pnl: v.metrics?.net_pnl?.value ?? null,
              sharpe: v.metrics?.sharpe_ratio?.value ?? null,
              resolved: v.metrics?.win_rate?.sampleSize ?? 0,
            })));
            const keyMks = [1, 5, 9, 11, 14, 17, 18];
            setCompare(d.filter((v: any) => keyMks.includes(v.mk)));
            totalResolved = d.reduce((acc: number, v: any) => Math.max(acc, v.metrics?.win_rate?.sampleSize ?? 0), 0);
          }
        }
        setDataState(totalResolved >= MIN_RESOLVED_FOR_PUBLISH ? "live" : "insufficient");
      } catch {
        setDataState("error");
      }
    }
    load();
  }, []);

  const deployed = versions.find((v) => v.status === "DEPLOYED");
  const deployedResolved = (deployed as any)?.resolved ?? 0;
  const hasEnoughData = deployedResolved >= MIN_RESOLVED_FOR_PUBLISH;
  const latestWr = hasEnoughData ? (deployed?.win_rate ?? null) : null;
  const firstWr = versions[0]?.win_rate ?? null;
  const winRateGain = latestWr !== null && firstWr !== null ? Math.round(latestWr - firstWr) : null;

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

          {/* Honesty banner when sample too small */}
          {dataState === "insufficient" && (
            <div className="rise mt-8 border border-gold/30 bg-gold/5 px-5 py-3 mono text-[11px] uppercase tracking-[0.2em] text-gold">
              ● Re-baselining in progress · sample size below {MIN_RESOLVED_FOR_PUBLISH} resolved markets · numbers below refresh as data arrives
            </div>
          )}
          {dataState === "error" && (
            <div className="rise mt-8 border border-paper-muted/30 bg-paper-muted/5 px-5 py-3 mono text-[11px] uppercase tracking-[0.2em] text-paper-muted">
              ● API unreachable · showing zero state
            </div>
          )}

          {/* Stat boxes */}
          <div className="rise mt-16 grid grid-cols-2 gap-4 md:grid-cols-4" style={{ animationDelay: "0.3s" }}>
            {[
              { label: "Versions built", value: String(versions.length || 0), color: "text-paper" },
              { label: "Win rate gain", value: winRateGain !== null ? `+${winRateGain}pp` : "—", color: "text-phosphor" },
              { label: "Markets resolved", value: deployedResolved > 0 ? `${deployedResolved}` : "—", color: "text-paper" },
              { label: "Current Sharpe", value: hasEnoughData && deployed?.sharpe != null ? deployed.sharpe.toFixed(2) : "—", color: "text-gold" },
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
      {tier === "public" && (
        <section className="py-24 text-center">
          <div className="mx-auto max-w-xl px-8">
            <div className="border border-phosphor/20 bg-phosphor/[0.03] backdrop-blur-xl rounded-lg p-12">
              <div className="mono text-[10px] uppercase tracking-[0.3em] text-phosphor mb-4">Subscriber access</div>
              <h3 className="display text-3xl text-paper mb-4">See the full picture.</h3>
              <p className="text-paper-muted text-sm mb-8">Tracked wallets, category performance, and system analytics. Available to Coattail subscribers.</p>
              <a href="https://buy.stripe.com/eVq5kC5iw7UD1RRbJY0Jq08"
                className="inline-block bg-phosphor text-ink px-8 py-3 mono text-sm font-bold tracking-wide hover:shadow-[0_0_20px_rgba(64,255,158,0.2)] transition-shadow">
                Subscribe — $9/mo →
              </a>
            </div>
          </div>
        </section>
      )}
      {(tier === "subscriber" || tier === "internal") && <>
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

      </>}

      {/* ── 5. Internal: Suit Lab grid ── */}
      {tier === "internal" && <>
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

      </>}

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
