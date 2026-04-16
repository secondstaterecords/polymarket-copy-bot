/* eslint-disable @typescript-eslint/no-unused-vars */
import Link from "next/link";

// ── Live-feel data (static snapshots; would be live via API in production) ──
const tickerTrades = [
  { trader: "0x2a2c", market: "NBA-GSW-LAC", side: "YES", price: "33¢", delta: "+$11" },
  { trader: "sovereign2013", market: "NHL-DAL-BUF", side: "U5.5", price: "41¢", delta: "+$6" },
  { trader: "elkmonkey", market: "UCL-ARS-SPO", side: "DRAW", price: "22¢", delta: "+$17" },
  { trader: "0x2a2c", market: "NBA-ORL-PHI", side: "76ers", price: "55¢", delta: "+$10" },
  { trader: "RN1", market: "MLB-TOR-MIL", side: "YES", price: "45¢", delta: "+$3" },
  { trader: "swisstony", market: "EPL-TOT-BRI", side: "BRI", price: "41¢", delta: "+$2" },
  { trader: "sovereign2013", market: "WTA-SAM-GAU", side: "OVER", price: "20¢", delta: "+$5" },
  { trader: "Cannae", market: "UEL-NOT-POR", side: "UNDER", price: "32¢", delta: "pending" },
  { trader: "0x2a2c", market: "BTC-UPDN-5M", side: "UP", price: "35¢", delta: "+$2" },
  { trader: "elkmonkey", market: "NHL-SEA-COL", side: "COL", price: "62¢", delta: "pending" },
];

const leaderboard = [
  { rank: 1, name: "0x2a2c", wr: 92, ret: "+213%", trades: 36, conf: "HIGH" },
  { rank: 2, name: "sovereign2013", wr: 71, ret: "+147%", trades: 14, conf: "MED" },
  { rank: 3, name: "RN1", wr: 57, ret: "+66%", trades: 7, conf: "LOW" },
  { rank: 4, name: "elkmonkey", wr: 44, ret: "+36%", trades: 9, conf: "LOW" },
  { rank: 5, name: "0x4924", wr: 80, ret: "+75%", trades: 5, conf: "LOW" },
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
          <span className="display text-2xl text-paper">Vole<span className="text-phosphor">.</span></span>
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

function Hero() {
  return (
    <section className="scanlines relative overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-8 pt-24 pb-12 md:pt-32 md:pb-16">
        {/* Top meta line */}
        <div className="rise flex items-center gap-4 mono text-[11px] uppercase tracking-[0.2em] text-paper-muted">
          <span className="text-phosphor glow">●</span>
          <span>VOLE-01 · live on hetzner · 22 wallets tracked</span>
          <span className="text-moss">/</span>
          <span>session #{new Date().toISOString().split("T")[0]}</span>
        </div>

        {/* Headline — editorial scale */}
        <h1 className="display rise mt-10 text-[clamp(64px,12vw,180px)] text-paper">
          The sharpest
          <br />
          <span className="italic text-phosphor glow">wallets</span> on
          <br />
          Polymarket,
          <br />
          <span className="relative inline-block">
            copied live.
            <span className="draw absolute -bottom-2 left-0 right-0 h-[3px] bg-gold"></span>
          </span>
        </h1>

        {/* Tagline */}
        <div className="rise mt-14 grid gap-10 md:grid-cols-[1.3fr_1fr]" style={{ animationDelay: "0.4s" }}>
          <p className="max-w-2xl text-xl leading-relaxed text-paper md:text-2xl">
            A trading desk in one command. Watches 22 verified profitable wallets,
            mirrors their positions in real time, sizes up winners and cools on
            losers — all from a cloud server that never sleeps.
          </p>
          <div className="flex flex-col gap-3 mono text-[11px] uppercase tracking-[0.18em] text-paper-muted">
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Top trader win rate</span>
              <span className="text-phosphor glow">92%</span>
            </div>
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Avg return on wins</span>
              <span className="text-gold">+213%</span>
            </div>
            <div className="flex justify-between border-b border-moss/50 pb-2">
              <span>Resolved trades tracked</span>
              <span>229</span>
            </div>
            <div className="flex justify-between">
              <span>Uptime this week</span>
              <span className="text-phosphor">99.1%</span>
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
              yourself. We run a live bot that mirrors proven wallets 24/7,
              tracks every resolution, and <em>automatically scales your bet
              size</em> when a trader is hot.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-paper-muted">
              Two wallets currently run at 2× our base size. Both are above 70%
              win rate with 3-figure % returns on resolved trades.
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
      body: "Every 30 seconds the bot polls 22 top Polymarket wallets via the Data API. New buys and sells are captured within a minute of execution.",
      detail: "poll_interval = 30s",
    },
    {
      num: "02",
      title: "Filter",
      body: "Smart guards reject noise: price outside 10-85¢, trader bet under $10, duplicate positions, circuit breakers on drawdown. 98% of signals are rejected.",
      detail: "signals_accepted = 2.1%",
    },
    {
      num: "03",
      title: "Mirror",
      body: "Accepted signals become real Polymarket orders via Bullpen. Proven winners get 2× sizing, cold streaks get cooled. Winnings auto-redeem on resolution.",
      detail: "avg_execution_lag = 47s",
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
          {/* Starter */}
          <div className="relative border border-moss/60 p-10 md:p-12">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted">
                  Tier I
                </div>
                <h3 className="display mt-3 text-4xl text-paper">Passenger</h3>
              </div>
              <div className="mono text-right">
                <div className="text-5xl tabular-nums text-paper">$29</div>
                <div className="text-[10px] uppercase tracking-widest text-paper-muted mt-1">per month</div>
              </div>
            </div>
            <p className="mt-6 text-paper-muted">
              Install Bullpen, run one command, copy Vole&rsquo;s live wallet.
              Your trades mirror ours — paused when we pause.
            </p>
            <ul className="mono mt-10 space-y-3 text-sm">
              <Feature>auto-mirror via Bullpen tracker</Feature>
              <Feature>~40-50 trades / week</Feature>
              <Feature>referral link with fee rebate</Feature>
              <Feature>Telegram alerts</Feature>
              <Feature>email support (~24h)</Feature>
            </ul>
            <a
              href="mailto:hello@vole.me?subject=Tier I access"
              className="mt-12 block border border-moss/60 py-4 text-center mono text-sm uppercase tracking-[0.2em] text-paper transition-colors hover:border-paper"
            >
              Request access →
            </a>
          </div>

          {/* Operator */}
          <div className="relative border border-phosphor bg-ink p-10 md:p-12">
            <div className="absolute -top-3 left-10 bg-phosphor px-3 py-1 mono text-[10px] uppercase tracking-[0.25em] text-ink">
              recommended
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
              The full bot on your own server. 22 wallets in parallel, adaptive
              sizing, your own risk controls, your own data.
            </p>
            <ul className="mono mt-10 space-y-3 text-sm">
              <Feature accent>full source code + updates</Feature>
              <Feature accent>copies 22 wallets (vs 1)</Feature>
              <Feature accent>per-trader EV &amp; CLV stats</Feature>
              <Feature accent>live dashboard on your machine</Feature>
              <Feature accent>30-day priority support</Feature>
              <Feature accent>Hetzner install guide ($4/mo server)</Feature>
            </ul>
            <a
              href="mailto:hello@vole.me?subject=Tier II access"
              className="mt-12 block bg-phosphor py-4 text-center mono text-sm uppercase tracking-[0.2em] text-ink transition-colors hover:bg-transparent hover:text-phosphor"
            >
              Take the keys →
            </a>
          </div>
        </div>

        <p className="mono mt-12 max-w-3xl text-xs leading-relaxed text-paper-muted">
          <span className="text-blood">·</span> <span className="uppercase tracking-wider">Disclosure.</span>
          Prediction markets carry real financial risk. Past performance of the
          wallets we copy does not guarantee future returns. You trade with your
          own funds through your own Polymarket account. We are not a
          broker-dealer and not registered with any regulatory body. Not
          available in jurisdictions that prohibit prediction-market wagering.
        </p>
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
            <div className="display text-3xl text-paper">Vole<span className="text-phosphor">.</span></div>
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
              <li><a href="mailto:hello@vole.me" className="hover:text-phosphor">hello@vole.me</a></li>
              <li><a href="#" className="hover:text-phosphor">telegram</a></li>
              <li><a href="#" className="hover:text-phosphor">discord</a></li>
            </ul>
          </div>
        </div>
        <div className="rule mt-12" />
        <div className="mono mt-8 flex flex-col justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-paper-muted md:flex-row">
          <span>© {new Date().getFullYear()} vole — all signals digital</span>
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
      <Pricing />
      <Footer />
    </main>
  );
}
