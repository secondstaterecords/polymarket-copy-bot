export default function Welcome() {
  const WALLET = "0x1023C11A242905BF9C1F25f199B8107047EBe18c";

  return (
    <main className="relative z-10 min-h-screen">
      <header className="border-b border-moss/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 sm:px-8 py-5">
          <a href="/" className="display text-xl sm:text-2xl text-paper">
            Coattail<span className="text-phosphor">.</span>
          </a>
          <span className="mono text-[9px] sm:text-[10px] uppercase tracking-[0.3em] text-paper-muted">
            setup guide
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 sm:px-8 py-12 sm:py-20">
        {/* Confirmation */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-phosphor/20 flex items-center justify-center shrink-0">
            <span className="text-phosphor text-xl sm:text-2xl">✓</span>
          </div>
          <div>
            <h1 className="display text-2xl sm:text-4xl text-paper">You&rsquo;re in.</h1>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-paper-muted mt-1">
              3 steps · 5 minutes · no coding
            </p>
          </div>
        </div>

        <div className="rule mb-10" />

        <div className="space-y-12">
          {/* ── STEP 1 ── */}
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="mono text-3xl text-moss tabular-nums">01</span>
              <h3 className="display text-xl sm:text-2xl text-paper">Create your free trading account</h3>
            </div>
            <p className="text-paper-muted ml-12">
              This is where your trades execute — your money stays in your own wallet.
            </p>
            <div className="ml-12 mt-4">
              <a
                href="https://bullpen.fi/@gilded-vole"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block border border-phosphor bg-phosphor px-5 py-2.5 mono text-xs sm:text-sm uppercase tracking-[0.15em] text-ink hover:bg-transparent hover:text-phosphor transition-colors"
              >
                Create Account →
              </a>
              <p className="mono text-[10px] text-paper-muted mt-2">
                Sign up with Google or email. Takes 30 seconds.
              </p>
            </div>
          </div>

          {/* ── STEP 2 ── */}
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="mono text-3xl text-moss tabular-nums">02</span>
              <h3 className="display text-xl sm:text-2xl text-paper">Deposit funds</h3>
            </div>
            <p className="text-paper-muted ml-12">
              Go to <strong className="text-paper">Wallet</strong> in the app and deposit USDC.
              You can buy USDC directly with a debit card.
            </p>
            <div className="ml-12 mt-4 border border-moss/40 p-4 sm:p-5">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-paper-muted mb-3">
                Recommended starting amounts
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="border border-moss/40 py-3">
                  <div className="mono text-lg text-paper">$50</div>
                  <div className="mono text-[9px] text-paper-muted mt-1">minimum</div>
                </div>
                <div className="border border-phosphor/50 py-3 bg-phosphor/5">
                  <div className="mono text-lg text-phosphor">$200</div>
                  <div className="mono text-[9px] text-phosphor/70 mt-1">recommended</div>
                </div>
                <div className="border border-gold/40 py-3">
                  <div className="mono text-lg text-gold">$1000+</div>
                  <div className="mono text-[9px] text-paper-muted mt-1">optimal</div>
                </div>
              </div>
              <p className="mono text-[9px] text-paper-muted mt-3">
                More capital = more trades captured. The system only deploys a safe fraction per position.
              </p>
            </div>
          </div>

          {/* ── STEP 3 ── */}
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="mono text-3xl text-moss tabular-nums">03</span>
              <h3 className="display text-xl sm:text-2xl text-paper">Start copying trades</h3>
            </div>

            <div className="ml-12 space-y-6">
              <p className="text-paper-muted">
                Go to <strong className="text-paper">Tracker</strong> →{" "}
                <strong className="text-paper">Copying</strong> tab → tap{" "}
                <strong className="text-phosphor">+ Copy</strong> (desktop) or{" "}
                <strong className="text-phosphor">+ Copy A Trader</strong> (mobile).
              </p>

              {/* Form fields */}
              <div className="border border-moss/40 divide-y divide-moss/40">
                {/* Wallet Address */}
                <div className="p-4 sm:p-5">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-paper-muted mb-2">
                    Wallet Address — paste this exactly
                  </div>
                  <div className="bg-ink border border-phosphor/30 p-3 mono text-xs sm:text-sm text-phosphor break-all select-all cursor-pointer">
                    {WALLET}
                  </div>
                  <p className="mono text-[9px] text-paper-muted mt-2">
                    Tap to select → copy → paste into the Wallet Address field
                  </p>
                </div>

                {/* Settings */}
                <div className="p-4 sm:p-5">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-paper-muted mb-3">
                    Fill in these settings
                  </div>
                  <div className="space-y-3 mono text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-moss/20">
                      <span className="text-paper-muted">Recommended Settings</span>
                      <span className="text-phosphor">✓ Keep checked</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-moss/20">
                      <span className="text-paper-muted">Allocation type</span>
                      <span className="text-paper">Fixed</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-moss/20">
                      <span className="text-paper-muted">Amount per trade</span>
                      <span className="text-phosphor">$5</span>
                      <span className="text-[9px] text-paper-muted">(type 5 in custom field)</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-moss/20">
                      <span className="text-paper-muted">Max per market</span>
                      <span className="text-paper">$100</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-paper-muted">When they sell</span>
                      <span className="text-phosphor">Auto-sell</span>
                    </div>
                  </div>
                </div>

                {/* Button */}
                <div className="p-4 sm:p-5 text-center">
                  <div className="inline-block bg-phosphor/20 border border-phosphor/40 px-8 py-3 mono text-sm text-phosphor">
                    Tap &ldquo;Start Copying&rdquo;
                  </div>
                </div>
              </div>

              <p className="text-paper-muted text-sm">
                That&rsquo;s it. The system mirrors every trade automatically from here.
                When we buy, you buy. When we sell, you sell. No manual work needed.
              </p>
            </div>
          </div>
        </div>

        <div className="rule mt-14 mb-10" />

        {/* Done */}
        <div className="text-center">
          <div className="display text-2xl sm:text-3xl text-paper mb-3">
            You&rsquo;re live.
          </div>
          <p className="text-paper-muted max-w-md mx-auto text-sm sm:text-base">
            Trades mirror automatically 24/7. Check back in the{" "}
            <strong className="text-paper">Copied Trades</strong> tab to see activity.
          </p>
          <div className="mt-8 space-y-2">
            <p className="mono text-[10px] uppercase tracking-[0.15em] text-paper-muted">
              Questions? We respond fast:
            </p>
            <a href="mailto:jarvismaxmorrish@gmail.com?subject=Coattail%20Help" className="mono text-sm text-phosphor hover:underline block">
              jarvismaxmorrish@gmail.com
            </a>
          </div>
          <p className="mono text-[9px] text-paper-muted mt-8">
            By using Coattail you agree to our <a href="/terms" className="underline hover:text-paper">Terms of Service</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
