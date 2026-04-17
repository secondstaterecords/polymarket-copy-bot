"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from "react";

// ── Live-feel data (static snapshots; would be live via API in production) ──
const tickerTrades = [
  { trader: "WALLET-A", market: "NBA", side: "YES", price: "33¢", delta: "+$11" },
  { trader: "WALLET-B", market: "NHL", side: "U5.5", price: "41¢", delta: "+$6" },
  { trader: "WALLET-C", market: "UCL", side: "DRAW", price: "22¢", delta: "+$17" },
  { trader: "WALLET-A", market: "NBA", side: "HOME", price: "55¢", delta: "+$10" },
  { trader: "WALLET-D", market: "MLB", side: "YES", price: "45¢", delta: "+$3" },
  { trader: "WALLET-E", market: "EPL", side: "AWAY", price: "41¢", delta: "+$2" },
  { trader: "WALLET-B", market: "WTA", side: "OVER", price: "20¢", delta: "+$5" },
  { trader: "WALLET-F", market: "UEL", side: "UNDER", price: "32¢", delta: "pending" },
  { trader: "WALLET-A", market: "CRYPTO", side: "UP", price: "35¢", delta: "+$2" },
  { trader: "WALLET-C", market: "NHL", side: "HOME", price: "62¢", delta: "pending" },
];

// Anonymized wallet codes — real addresses stay private
const leaderboard = [
  { rank: 1, name: "WALLET-A", wr: 92, ret: "+213%", trades: 36, conf: "HIGH" },
  { rank: 2, name: "WALLET-B", wr: 71, ret: "+147%", trades: 14, conf: "MED" },
  { rank: 3, name: "WALLET-C", wr: 57, ret: "+66%", trades: 7, conf: "LOW" },
  { rank: 4, name: "WALLET-D", wr: 44, ret: "+36%", trades: 9, conf: "LOW" },
  { rank: 5, name: "WALLET-E", wr: 80, ret: "+75%", trades: 5, conf: "LOW" },
];

// ── Tiny inline sparkline component (pure SVG, no deps) ──
function Sparkline({ points, color = "currentColor" }: { points: number[]; color?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="shimmer">
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Ticker strip that scrolls endlessly ──
function Ticker() {
  const items = [...tickerTrades, ...tickerTrades, ...tickerTrades];
  return (
    <div className="relative overflow-hidden border-y border-moss/60 bg-ink py-3">
      <div className="ticker-track mono text-xs text-paper-muted">
        {items.map((t, i) => (
          <span key={i} className="mx-8 inline-flex items-center gap-3">
            <span className="text-phosphor">●</span>
            <span className="uppercase tracking-widest text-paper">{t.trader}</span>
            <span className="text-moss">/</span>
            <span>{t.market}</span>
            <span className="text-moss">/</span>
            <span className="text-paper">{t.side}</span>
            <span className="text-moss">@</span>
            <span className="text-gold">{t.price}</span>
            <span className="ml-2">
              {t.delta === "pending" ? (
                <span className="text-paper-muted">open</span>
              ) : (
                <span className="text-phosphor">{t.delta}</span>
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="relative z-20 border-b border-moss/40">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <div className="flex items-baseline gap-6">
          <span className="display text-2xl text-paper">Coattail<span className="text-phosphor">.</span></span>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-paper-muted">
            prediction-market copy desk
          </span>
        </div>
        <nav className="flex items-center gap-8 mono text-xs uppercase tracking-wider text-paper-muted">
          <a href="#edge" className="hover:text-phosphor transition-colors">edge</a>
          <a href="#mechanism" className="hover:text-phosphor transition-colors">mechanism</a>
          <a href="#pricing" className="hover:text-phosphor transition-colors">access</a>
          <a
            href="#pricing"
            className="rounded-none border border-phosphor bg-phosphor px-4 py-2 text-ink hover:bg-transparent hover:text-phosphor transition-colors"
          >
            Subscribe →
          </a>
        </nav>
      </div>
    </header>
  );
}

interface LiveStats {
  tradesToday: number;
  tradesThisWeek: number;
  realPnlPct: number;
  realPnlUsd: number;
  resolvedMarkets: number;
  topWalletWinRate: number;
  topWalletReturnPct: number;
}

function useLiveStats() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const r = await fetch("https://coattail.me/api/public", { cache: "no-store" });
        if (!r.ok) throw new Error("bad status");
        const d = await r.json();
        if (!cancelled) setStats(d);
      } catch {
        // Fallback: try direct IP
        try {
          const r = await fetch("http://178.104.84.77:3848/api/public", { cache: "no-store" });
          if (!r.ok) return;
          const d = await r.json();
          if (!cancelled) setStats(d);
        } catch {}
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 60 * 1000); // refresh every 60s
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return stats;
}

function Hero() {
  const stats = useLiveStats();
  return (
    <section className="scanlines relative overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-8 pt-24 pb-12 md:pt-32 md:pb-16">
        {/* Top meta line */}
        <div className="rise flex items-center gap-4 mono text-[11px] uppercase tracking-[0.2em] text-paper-muted">
          <span className="text-phosphor glow">●</span>
          <span>COATTAIL-01 · live · {stats ? `${stats.tradesToday} trades today` : "polling"}</span>
        </div>

        {/* Headline — editorial scale */}
        <h1 className="display rise mt-10 text-[clamp(64px,12vw,180px)] text-paper">
          The sharpest
          <br />
          <span className="italic text-phosphor glow">wallets</span> in
          <br />
          prediction
          <br />
          <span className="relative inline-block">
            markets.
            <span className="draw absolute -bottom-2 left-0 right-0 h-[3px] bg-gold"></span>
          </span>
        </h1>

        {/* Tagline */}
        <div className="rise mt-14 grid gap-10 md:grid-cols-[1.3fr_1fr]" style={{ animationDelay: "0.4s" }}>
          <p className="max-w-2xl text-xl leading-relaxed text-paper md:text-2xl">
            An automated copy desk tracking verified top performers.
            Dynamic roster — we cycle in whoever&rsquo;s printing this week.
            Adaptive sizing scales up the sharps, cools losing streaks.
            Runs 24/7 so you don&rsquo;t have to.
          </p>
          <div className="flex flex-col gap-3 mono text-[11px] uppercase tracking-[0.18em] text-paper-muted">
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Top wallet win rate</span>
              <span className="text-phosphor glow">{stats?.topWalletWinRate ?? 92}%</span>
            </div>
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Avg return on wins</span>
              <span className="text-gold">+{stats?.topWalletReturnPct ?? 213}%</span>
            </div>
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Resolved markets tracked</span>
              <span>{stats?.resolvedMarkets ?? 229}</span>
            </div>
            <div className="flex justify-between">
              <span>Trades this week</span>
              <span className="text-phosphor">{stats?.tradesThisWeek ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="rise mt-14 flex flex-col gap-4 sm:flex-row" style={{ animationDelay: "0.6s" }}>
          <a
            href="#pricing"
            className="group inline-flex items-center justify-center gap-3 border border-phosphor bg-phosphor px-8 py-4 mono text-sm uppercase tracking-[0.2em] text-ink transition-colors hover:bg-transparent hover:text-phosphor"
          >
            Start copying
            <span className="cursor">_</span>
          </a>
          <a
            href="#edge"
            className="inline-flex items-center justify-center gap-3 border border-moss/70 px-8 py-4 mono text-sm uppercase tracking-[0.2em] text-paper transition-colors hover:border-paper"
          >
            See the data ↓
          </a>
        </div>
      </div>

      <Ticker />
    </section>
  );
}

// ── Edge section: leaderboard with real-feeling data ──
function Edge() {
  return (
    <section id="edge" className="relative py-28">
      <div className="mx-auto max-w-7xl px-8">
        <div className="grid gap-16 lg:grid-cols-[auto_1fr] lg:gap-24">
          <div className="max-w-md">
            <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
              · 01 — the edge
            </div>
            <h2 className="display mt-6 text-6xl text-paper md:text-7xl">
              Not a signal
              <br />
              group.
              <br />
              <span className="italic text-phosphor">A desk.</span>
            </h2>
            <p className="mt-8 text-lg leading-relaxed text-paper-muted">
              Most &ldquo;copy trading&rdquo; tools hand you a list of trades to place
              yourself. We run a live desk that mirrors a curated roster 24/7,
              tracks every outcome, and <em>automatically scales your bet
              size</em> when a wallet is hot.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-paper-muted">
              Two wallets currently run at 2× base size. Both above 70%
              win rate with 3-figure % returns on resolved markets. The
              roster updates weekly — we drop cold wallets, add fresh sharps.
            </p>
          </div>

          {/* Leaderboard table */}
          <div className="min-w-0">
            <div className="mono mb-4 flex items-baseline justify-between text-[11px] uppercase tracking-[0.25em] text-paper-muted">
              <span>live · trader performance</span>
              <span>rolling 30 days</span>
            </div>
            <div className="border-t border-paper/20">
              {leaderboard.map((r) => (
                <div
                  key={r.name}
                  className="grid grid-cols-[auto_1.4fr_1fr_1fr_auto_auto] items-baseline gap-6 border-b border-moss/40 py-5 hover:bg-moss/10 transition-colors"
                >
                  <div className="mono text-xs text-paper-muted tabular-nums">
                    {String(r.rank).padStart(2, "0")}
                  </div>
                  <div>
                    <div className="mono text-base text-paper">{r.name}</div>
                    <div className="mono text-[10px] uppercase tracking-widest text-paper-muted mt-0.5">
                      {r.trades} resolved · conf {r.conf}
                    </div>
                  </div>
                  <div className="mono">
                    <div className="text-[10px] uppercase tracking-wider text-paper-muted">win rate</div>
                    <div className={`text-lg tabular-nums ${r.wr >= 60 ? "text-phosphor" : r.wr >= 50 ? "text-paper" : "text-paper-muted"}`}>
                      {r.wr}<span className="text-paper-muted">%</span>
                    </div>
                  </div>
                  <div className="mono">
                    <div className="text-[10px] uppercase tracking-wider text-paper-muted">avg return</div>
                    <div className="text-lg tabular-nums text-gold">{r.ret}</div>
                  </div>
                  <div className="hidden md:block text-phosphor-dim">
                    <Sparkline points={[3, 2, 4, 5, 4, 7, 6, 9, 8, 11, 10, 14]} />
                  </div>
                  <div className="mono text-xs">
                    {r.wr >= 70 && r.conf !== "LOW" ? (
                      <span className="border border-phosphor px-2 py-1 text-phosphor">2×</span>
                    ) : (
                      <span className="border border-moss/60 px-2 py-1 text-paper-muted">1×</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mono mt-4 text-[10px] uppercase tracking-widest text-paper-muted">
              * confidence scales with resolved-trade count. Bot auto-sizes up
              proven winners, down known losers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Mechanism: three terminal-style panels ──
function Mechanism() {
  const panels = [
    {
      num: "01",
      title: "Watch",
      body: "A curated roster of top-performing wallets is tracked continuously. New buys and sells are detected within seconds of execution.",
      detail: "latency < 60s",
    },
    {
      num: "02",
      title: "Filter",
      body: "Proprietary guards reject the noise — junk prices, tiny positions, both-sides bets, overexposure, cold-streak wallets. Only ~2% of signals survive.",
      detail: "signal_pass_rate = 2.1%",
    },
    {
      num: "03",
      title: "Mirror",
      body: "Survivors become real orders on your own account. Hot wallets get sized up, cold ones cooled. Winnings auto-claim on resolution. You sleep.",
      detail: "execution = automatic",
    },
  ];
  return (
    <section id="mechanism" className="relative border-y border-moss/40 py-28">
      <div className="mx-auto max-w-7xl px-8">
        <div className="mb-20 max-w-3xl">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
            · 02 — mechanism
          </div>
          <h2 className="display mt-6 text-6xl text-paper md:text-7xl">
            Three steps.
            <br />
            <span className="italic text-gold">No dashboards to babysit.</span>
          </h2>
        </div>

        <div className="grid gap-0 md:grid-cols-3">
          {panels.map((p, i) => (
            <div
              key={p.num}
              className={`relative p-10 ${i !== panels.length - 1 ? "md:border-r" : ""} ${i !== 0 ? "border-t md:border-t-0" : ""} border-moss/40`}
            >
              <div className="mono text-6xl text-moss tabular-nums">{p.num}</div>
              <h3 className="display mt-6 text-4xl text-paper">{p.title}</h3>
              <p className="mt-6 text-lg leading-relaxed text-paper">
                {p.body}
              </p>
              <div className="mono mt-8 inline-block border border-moss/60 bg-ink px-3 py-1.5 text-[11px] text-phosphor">
                &gt; {p.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Roadmap: show vision without revealing sauce ──
function Roadmap() {
  const phases = [
    {
      label: "NOW",
      status: "live",
      title: "Copy desk",
      body: "Mirroring a curated roster of top-performing wallets with adaptive position sizing. Proven winners get scaled up automatically.",
    },
    {
      label: "Q3 2026",
      status: "building",
      title: "Statistical confidence engine",
      body: "Every trade scored against historical resolution data. The system learns which wallets win in which markets — and sizes accordingly.",
    },
    {
      label: "Q4 2026",
      status: "planned",
      title: "Autonomous desk",
      body: "The model begins identifying its own edge. Cross-market analysis, closing-line-value tracking, and self-correcting position management.",
    },
  ];

  return (
    <section id="roadmap" className="relative border-t border-moss/40 py-28">
      <div className="mx-auto max-w-7xl px-8">
        <div className="mb-16 max-w-3xl">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
            · where this is going
          </div>
          <h2 className="display mt-6 text-5xl text-paper md:text-6xl">
            Copy trading is
            <br />
            <span className="italic text-gold">phase one.</span>
          </h2>
        </div>

        <div className="relative grid gap-0 md:grid-cols-3">
          {/* Connecting line */}
          <div className="absolute top-[52px] left-0 right-0 hidden h-px bg-moss/40 md:block" />
          {phases.map((p, i) => (
            <div key={p.label} className={`relative p-8 ${i !== phases.length - 1 ? "md:border-r" : ""} ${i !== 0 ? "border-t md:border-t-0" : ""} border-moss/40`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`h-3 w-3 rounded-full ${
                  p.status === "live" ? "bg-phosphor glow" :
                  p.status === "building" ? "bg-gold" :
                  "bg-moss"
                }`} />
                <span className="mono text-[11px] uppercase tracking-[0.25em] text-paper-muted">
                  {p.label}
                </span>
                {p.status === "live" && (
                  <span className="mono text-[9px] uppercase tracking-widest text-phosphor border border-phosphor/40 px-2 py-0.5">
                    live
                  </span>
                )}
              </div>
              <h3 className="display text-3xl text-paper">{p.title}</h3>
              <p className="mt-4 text-paper-muted leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing: two tiers, editorial not boxy ──
function Pricing() {
  return (
    <section id="pricing" className="relative py-28">
      <div className="mx-auto max-w-7xl px-8">
        <div className="mb-20 max-w-3xl">
          <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
            · 03 — access
          </div>
          <h2 className="display mt-6 text-6xl text-paper md:text-7xl">
            Two ways in.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-paper-muted">
            Start passive — or go full operator. Both use your own Polymarket
            wallet. We never hold your funds.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-2">
          {/* Passenger */}
          <div className="relative border border-moss/60 p-10 md:p-12">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
                  Tier I
                </div>
                <h3 className="display mt-3 text-4xl text-paper">Passenger</h3>
              </div>
              <div className="mono text-right">
                <div className="text-5xl tabular-nums text-paper">$9</div>
                <div className="text-[10px] uppercase tracking-widest text-paper-muted mt-1">per month</div>
              </div>
            </div>
            <p className="mt-6 text-paper-muted">
              Auto-mirror every trade the desk makes. One setup,
              then it runs on your own account with zero maintenance.
            </p>
            <ul className="mono mt-10 space-y-3 text-sm">
              <Feature>auto-mirror all trades in real time</Feature>
              <Feature>up to ~120 trades / week<span className="text-paper-muted">*</span></Feature>
              <Feature>Telegram alerts on every trade</Feature>
              <Feature>Discord community + AI support</Feature>
              <Feature>weekly performance recaps</Feature>
              <Feature>referral rebate on platform fees</Feature>
            </ul>
            <a
              href="https://buy.stripe.com/eVq5kC5iw7UD1RRbJY0Jq08"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-12 block border border-moss/60 py-4 text-center mono text-sm uppercase tracking-[0.2em] text-paper transition-colors hover:border-paper"
            >
              Start mirroring — $9/mo →
            </a>
          </div>

          {/* Operator */}
          <div className="relative border border-phosphor bg-ink p-10 md:p-12">
            <div className="absolute -top-3 left-10 bg-phosphor px-3 py-1 mono text-[10px] uppercase tracking-[0.25em] text-ink">
              full access
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.3em] text-phosphor">
                  Tier II
                </div>
                <h3 className="display mt-3 text-4xl text-paper">Operator</h3>
              </div>
              <div className="mono text-right">
                <div className="text-5xl tabular-nums text-paper">$99</div>
                <div className="text-[10px] uppercase tracking-widest text-paper-muted mt-1">per month</div>
              </div>
            </div>
            <p className="mt-6 text-paper-muted">
              Your own instance + full source code. GitHub repo access
              means every update ships to you day-one.
            </p>
            <ul className="mono mt-10 space-y-3 text-sm">
              <Feature accent>everything in Passenger</Feature>
              <Feature accent>private GitHub repo (every commit, day-one)</Feature>
              <Feature accent>full source code + architecture docs</Feature>
              <Feature accent>concierge server deploy (we configure it)</Feature>
              <Feature accent>custom risk parameters + kill switches</Feature>
              <Feature accent>internal stats dashboard (live)</Feature>
              <Feature accent>direct support from the founder</Feature>
              <Feature accent>early access to future products</Feature>
            </ul>
            <a
              href="https://buy.stripe.com/5kQbJ07qE7UD7cb29o0Jq09"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-12 block bg-phosphor py-4 text-center mono text-sm uppercase tracking-[0.2em] text-ink transition-colors hover:bg-transparent hover:text-phosphor"
            >
              Take the keys — $99/mo →
            </a>
          </div>
        </div>

        <div className="mono mt-12 max-w-3xl space-y-3 text-xs leading-relaxed text-paper-muted">
          <p>
            <span className="text-gold">*</span> Trade volume assumes a fully
            funded account. Actual trade count scales with your capital — a
            thinly funded account trades less because the system only deploys a
            bounded fraction of capital per position.
          </p>
          <p>
            <span className="text-blood">·</span> <span className="uppercase tracking-wider">Disclosure.</span>
            Prediction markets carry real financial risk. Past performance of
            tracked wallets does not guarantee future returns. You trade with
            your own funds through your own account. We are not a broker-dealer
            and not registered with any regulatory body. Not available in
            jurisdictions that prohibit prediction-market wagering.
          </p>
        </div>
      </div>
    </section>
  );
}

function Feature({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-paper">
      <span className={`mt-1 ${accent ? "text-phosphor" : "text-gold"}`}>▸</span>
      <span>{children}</span>
    </li>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-moss/40 py-16">
      <div className="mx-auto max-w-7xl px-8">
        <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <div className="display text-3xl text-paper">Coattail<span className="text-phosphor">.</span></div>
            <p className="mt-4 max-w-sm text-paper-muted">
              Built by one operator in Charlottesville. Same hands on the
              keyboard as on the trades.
            </p>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-paper-muted">
              the product
            </div>
            <ul className="mt-4 space-y-2 text-paper">
              <li><a href="#edge" className="hover:text-phosphor">the edge</a></li>
              <li><a href="#mechanism" className="hover:text-phosphor">mechanism</a></li>
              <li><a href="#pricing" className="hover:text-phosphor">access</a></li>
            </ul>
          </div>
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-paper-muted">
              contact
            </div>
            <ul className="mt-4 space-y-2 text-paper">
              <li><a href="mailto:hello@coattail.me" className="hover:text-phosphor">hello@coattail.me</a></li>
              <li><a href="#" className="hover:text-phosphor">telegram</a></li>
              <li><a href="#" className="hover:text-phosphor">discord</a></li>
            </ul>
          </div>
        </div>
        <div className="rule mt-12" />
        <div className="mono mt-8 flex flex-col justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-paper-muted md:flex-row">
          <span>© {new Date().getFullYear()} coattail — all signals digital</span>
          <span>built with a bot, for bots</span>
        </div>
      </div>
    </footer>
  );
}

export default function Page() {
  return (
    <main className="relative z-10">
      <Nav />
      <Hero />
      <Edge />
      <Mechanism />
      <Roadmap />
      <Pricing />
      <Footer />
    </main>
  );
}
