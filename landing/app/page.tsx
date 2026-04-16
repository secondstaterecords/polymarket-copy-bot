import {
  ShieldCheck,
  BarChart3,
  ArrowDownUp,
  FlaskConical,
  LayoutDashboard,
  Users,
  Bot,
  Zap,
  Eye,
  Check,
} from "lucide-react";

function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-emerald-500" />
          <span className="text-lg font-semibold tracking-tight">
            Polymarket Copy Bot
          </span>
        </div>
        <a
          href="#pricing"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
        >
          Get Started
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      {/* Gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-zinc-950 to-zinc-950" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
          Copy a Profitable Polymarket Wallet.{" "}
          <span className="text-emerald-400">In one command.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 md:text-xl">
          A bot tracking 22 top traders with 92%+ win rates on some. Adaptive sizing,
          smart filters, zero manual work. Runs 24/7 on a cloud server.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#pricing"
            className="rounded-lg bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            See Pricing
          </a>
          <a
            href="#how-it-works"
            className="rounded-lg border border-zinc-700 px-8 py-3.5 text-base font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            How It Works
          </a>
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    number: "01",
    icon: Zap,
    title: "We Set Up Your Bot",
    description:
      "In a 15-minute call, we configure your Bullpen CLI wallet, pick your traders, and set your risk limits.",
  },
  {
    number: "02",
    icon: ArrowDownUp,
    title: "The Bot Mirrors Top Traders",
    description:
      "It polls 10 proven wallets every 30 seconds. Smart filters block bad odds, tiny trades, and overexposure.",
  },
  {
    number: "03",
    icon: Eye,
    title: "You Track Results",
    description:
      "Real-time dashboard shows your P&L, filter stats, and every trade with full transparency.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          How It Works
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
          Three steps to automated copy trading
        </p>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-8"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-500">
                  {step.number}
                </span>
                <step.icon className="h-5 w-5 text-zinc-400" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-3 leading-relaxed text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: ShieldCheck,
    title: "Smart Price Filters",
    description:
      "Only copies trades priced 0.10\u20130.85 (the profitable range)",
  },
  {
    icon: BarChart3,
    title: "Position Caps",
    description: "Max $25/market, $200/day exposure limits",
  },
  {
    icon: ArrowDownUp,
    title: "Exit Mirroring",
    description: "When the smart money sells, your bot sells too",
  },
  {
    icon: FlaskConical,
    title: "Paper Mode",
    description: "Test with fake money before going live",
  },
  {
    icon: LayoutDashboard,
    title: "Real-Time Dashboard",
    description: "Track every trade, P&L, and filter decision",
  },
  {
    icon: Users,
    title: "Multi-Wallet Confirmation",
    description: "Optional: only trade when 2+ whales agree",
  },
];

function Features() {
  return (
    <section className="border-t border-zinc-800/50 bg-zinc-900/30 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Built-In Safeguards
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
          Smart filters that protect your capital
        </p>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
            >
              <feature.icon className="h-6 w-6 text-emerald-500" />
              <h3 className="mt-4 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const proofPoints = [
  {
    stat: "13%+",
    label: "Returns in testing",
    detail: "Based on strategies that returned 13%+ in testing",
  },
  {
    stat: "60%+",
    label: "Win rate threshold",
    detail: "Tracks traders with $1M+ in volume and 60%+ win rates",
  },
  {
    stat: "8,600+",
    label: "Trade signals analyzed",
    detail: "8,600+ trade signals analyzed to build our filter system",
  },
];

function SocialProof() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Backed by Data
        </h2>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {proofPoints.map((point) => (
            <div key={point.stat} className="text-center">
              <div className="text-4xl font-bold text-emerald-400 md:text-5xl">
                {point.stat}
              </div>
              <div className="mt-2 text-sm font-medium uppercase tracking-wider text-zinc-500">
                {point.label}
              </div>
              <p className="mt-3 text-sm text-zinc-400">{point.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const includes = [
  "15-minute setup call",
  "Full bot installation",
  "Bullpen CLI wallet setup",
  "Risk configuration",
  "1 week of support",
];

const starterIncludes = [
  "Copy a verified profitable wallet (62%+ win rate)",
  "Bullpen CLI install instructions",
  "Your referral link with fee cashback",
  "Telegram alerts for trades",
  "Email support",
];

const proIncludes = [
  "Full bot running on your machine or server",
  "Copies 22+ top traders simultaneously",
  "Adaptive sizing based on trader track record (2x on winners)",
  "Smart filters (noise, dedup, price, daily caps)",
  "Live dashboard + per-trader stats + CLV tracking",
  "Telegram alerts for trades, wins, losses",
  "30 days of support + all future updates",
];

function Pricing() {
  return (
    <section
      id="pricing"
      className="border-t border-zinc-800/50 bg-zinc-900/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Start Copy Trading
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
          Two ways to get started. Simple starter for beginners, full bot for power users.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Starter tier */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 md:p-10">
            <div className="text-sm font-medium uppercase tracking-wider text-zinc-400">
              Starter
            </div>
            <div className="mt-2 text-xl font-semibold text-white">Copy My Wallet</div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-5xl font-bold text-white">$29</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              One command. Bullpen does the work. You get the same trades I make.
            </p>
            <ul className="mt-8 space-y-3">
              {starterIncludes.map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-300">
                  <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="#booking"
              className="mt-8 block w-full rounded-lg border border-zinc-700 bg-zinc-800 py-3.5 text-center text-base font-semibold text-white transition-colors hover:border-zinc-500 hover:bg-zinc-750"
            >
              Start Copying &mdash; $29/mo
            </a>
          </div>

          {/* Pro tier */}
          <div className="relative rounded-2xl border border-emerald-500/50 bg-zinc-900 p-8 md:p-10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-zinc-950">
              POWER USER
            </div>
            <div className="text-sm font-medium uppercase tracking-wider text-emerald-500">
              Pro
            </div>
            <div className="mt-2 text-xl font-semibold text-white">Run Your Own Bot</div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-5xl font-bold text-white">$99</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              Full source code. Runs on your machine or server. Copies 22 traders in parallel.
            </p>
            <ul className="mt-8 space-y-3">
              {proIncludes.map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-300">
                  <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="#booking"
              className="mt-8 block w-full rounded-lg bg-emerald-600 py-3.5 text-center text-base font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Get Pro &mdash; $99/mo
            </a>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-zinc-500">
          Not financial advice. Past results don&apos;t guarantee future performance. You&apos;re trading with real money.
        </p>
      </div>
    </section>
  );
}

function Booking() {
  return (
    <section id="booking" className="py-20 md:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Book Your Setup Call
        </h2>
        <p className="mx-auto mt-4 max-w-md text-center text-zinc-400">
          15 minutes is all it takes to get your copy trading bot live.
        </p>
        <div className="mt-12 flex min-h-[400px] items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="px-8 py-16 text-center">
            <p className="text-lg text-zinc-400">
              Cal.com booking widget loads here
            </p>
            <a
              href="mailto:max@example.com"
              className="mt-4 inline-block text-emerald-400 underline underline-offset-4 transition-colors hover:text-emerald-300"
            >
              Or email us directly to schedule
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center gap-4 text-sm text-zinc-500 md:flex-row md:justify-between">
          <div className="flex items-center gap-4">
            <span>
              Powered by{" "}
              <a
                href="https://bullpen.fi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline underline-offset-4 transition-colors hover:text-white"
              >
                Bullpen CLI
              </a>
            </span>
            <span className="hidden text-zinc-700 md:inline">&bull;</span>
            <span>Built with Claude Code</span>
          </div>
          <div className="text-zinc-600">
            Install with referral:{" "}
            <code className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              --referral @gilded-vole
            </code>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <SocialProof />
        <Pricing />
        <Booking />
      </main>
      <Footer />
    </>
  );
}
