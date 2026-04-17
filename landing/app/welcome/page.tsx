export default function Welcome() {
  return (
    <main className="relative z-10 min-h-screen">
      {/* Nav */}
      <header className="border-b border-moss/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
          <a href="/" className="display text-2xl text-paper">
            Coattail<span className="text-phosphor">.</span>
          </a>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-paper-muted">
            welcome aboard
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-8 py-20">
        {/* Confirmation */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-12 w-12 rounded-full bg-phosphor/20 flex items-center justify-center">
            <span className="text-phosphor text-2xl">✓</span>
          </div>
          <div>
            <h1 className="display text-4xl text-paper">You&rsquo;re in.</h1>
            <p className="mono text-[11px] uppercase tracking-[0.2em] text-paper-muted mt-1">
              Coattail Passenger — active
            </p>
          </div>
        </div>

        <div className="rule mb-12" />

        {/* Steps */}
        <h2 className="mono text-[11px] uppercase tracking-[0.3em] text-paper-muted mb-8">
          Setup — 5 minutes
        </h2>

        <div className="space-y-10">
          {/* Step 1 */}
          <div className="flex gap-6">
            <div className="mono text-4xl text-moss tabular-nums">01</div>
            <div className="flex-1">
              <h3 className="display text-2xl text-paper">Create your trading account</h3>
              <p className="mt-3 text-paper-muted">
                Sign up through our partner link to get fee rebates on every trade.
              </p>
              <a
                href="https://bullpen.fi/@gilded-vole"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block border border-phosphor bg-phosphor px-6 py-3 mono text-sm uppercase tracking-[0.2em] text-ink hover:bg-transparent hover:text-phosphor transition-colors"
              >
                Create Account →
              </a>
              <p className="mono mt-3 text-[10px] text-paper-muted">
                Already have an account? Skip to step 2.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-6">
            <div className="mono text-4xl text-moss tabular-nums">02</div>
            <div className="flex-1">
              <h3 className="display text-2xl text-paper">Install the CLI</h3>
              <p className="mt-3 text-paper-muted">
                Open Terminal (Mac) or Command Prompt (Windows) and paste:
              </p>
              <div className="mt-4 border border-moss/60 bg-ink p-4 mono text-sm text-phosphor overflow-x-auto">
                curl -fsSL https://cli.bullpen.fi/install.sh | bash
              </div>
              <p className="mt-3 text-paper-muted">
                Then restart your terminal and log in:
              </p>
              <div className="mt-2 border border-moss/60 bg-ink p-4 mono text-sm text-phosphor overflow-x-auto">
                bullpen login
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-6">
            <div className="mono text-4xl text-moss tabular-nums">03</div>
            <div className="flex-1">
              <h3 className="display text-2xl text-paper">Approve trading</h3>
              <p className="mt-3 text-paper-muted">
                This authorizes your wallet to place trades on the prediction market:
              </p>
              <div className="mt-4 border border-moss/60 bg-ink p-4 mono text-sm text-phosphor overflow-x-auto">
                bullpen polymarket approve --yes
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-6">
            <div className="mono text-4xl text-moss tabular-nums">04</div>
            <div className="flex-1">
              <h3 className="display text-2xl text-paper">Fund your account</h3>
              <p className="mt-3 text-paper-muted">
                Deposit USDC to start trading. We recommend $200+ for best results,
                but you can start with as little as $50.
              </p>
              <a
                href="https://app.bullpen.fi/wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block border border-gold px-6 py-3 mono text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold hover:text-ink transition-colors"
              >
                Open Wallet →
              </a>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-6">
            <div className="mono text-4xl text-moss tabular-nums">05</div>
            <div className="flex-1">
              <h3 className="display text-2xl text-paper">Start copying</h3>
              <p className="mt-3 text-paper-muted">
                One command. This mirrors every trade the Coattail desk makes, automatically:
              </p>
              <div className="mt-4 border border-moss/60 bg-ink p-4 mono text-sm text-phosphor overflow-x-auto whitespace-pre-wrap break-all">
{`bullpen tracker copy start 0x1023C11A242905BF9C1F25f199B8107047EBe18c \\
  --preset recommended \\
  --amount 5 \\
  --execution-mode auto \\
  --exit-behavior mirror_sells`}
              </div>
              <p className="mono mt-3 text-[10px] text-paper-muted">
                Change --amount to set your bet size per trade (default $5).
                Adjust based on your funded balance.
              </p>
            </div>
          </div>
        </div>

        <div className="rule mt-16 mb-12" />

        {/* Done */}
        <div className="text-center">
          <div className="display text-3xl text-paper mb-4">
            That&rsquo;s it. You&rsquo;re live.
          </div>
          <p className="text-paper-muted max-w-lg mx-auto">
            Trades will mirror automatically. No dashboard to check, no
            buttons to press. You&rsquo;ll receive Telegram alerts for every
            trade if you set them up.
          </p>
          <div className="mt-8 flex flex-col gap-3 items-center">
            <p className="mono text-[11px] uppercase tracking-[0.2em] text-paper-muted">
              Need help? Reach out:
            </p>
            <a href="mailto:hello@coattail.me" className="mono text-sm text-phosphor hover:underline">
              hello@coattail.me
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
