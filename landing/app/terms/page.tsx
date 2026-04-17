export default function Terms() {
  return (
    <main className="relative z-10 min-h-screen">
      <header className="border-b border-moss/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
          <a href="/" className="display text-2xl text-paper">
            Coattail<span className="text-phosphor">.</span>
          </a>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-paper-muted">legal</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-8 py-20">
        <h1 className="display text-5xl text-paper mb-2">Terms of Service</h1>
        <p className="mono text-[11px] uppercase tracking-[0.2em] text-paper-muted mb-12">
          Last updated: April 16, 2026
        </p>

        <div className="space-y-10 text-paper-muted leading-relaxed">
          <section>
            <h2 className="display text-2xl text-paper mb-4">1. Service Provider</h2>
            <p>
              Coattail is operated by <strong className="text-paper">Second State Records LLC</strong>,
              a Virginia limited liability company (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;).
              By using Coattail, you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">2. What Coattail Is</h2>
            <p>
              Coattail provides automated trade-mirroring software for prediction markets.
              We are <strong className="text-paper">not</strong> a broker-dealer, investment advisor,
              or financial institution. We do not hold, manage, or have access to your funds.
              All trades execute on your own account through third-party platforms.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">3. No Financial Advice</h2>
            <p>
              Nothing provided by Coattail constitutes financial, investment, tax, or legal advice.
              All content, signals, trade data, and performance metrics are provided for
              informational and entertainment purposes only. You should consult qualified
              professionals before making financial decisions.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">4. Assumption of Risk</h2>
            <p>
              Prediction markets involve significant risk of financial loss. By using Coattail, you acknowledge:
            </p>
            <ul className="mt-4 space-y-2 ml-4">
              <li className="flex gap-3"><span className="text-blood">·</span> Past performance does not guarantee future results.</li>
              <li className="flex gap-3"><span className="text-blood">·</span> You may lose some or all of your invested capital.</li>
              <li className="flex gap-3"><span className="text-blood">·</span> Trade-mirroring involves latency and may not replicate exact returns.</li>
              <li className="flex gap-3"><span className="text-blood">·</span> Third-party platform outages, API failures, and authentication issues may cause missed or failed trades.</li>
              <li className="flex gap-3"><span className="text-blood">·</span> You are solely responsible for all trading decisions and outcomes.</li>
            </ul>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">5. Your Account</h2>
            <p>
              You must be at least 18 years old and located in a jurisdiction where
              prediction-market trading is legal. You are responsible for maintaining the
              security of your trading account credentials. We are not liable for
              unauthorized access to your accounts.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">6. Subscription & Payment</h2>
            <ul className="space-y-2 ml-4">
              <li className="flex gap-3"><span className="text-gold">·</span> Subscriptions are billed monthly via Stripe.</li>
              <li className="flex gap-3"><span className="text-gold">·</span> All sales are final. No refunds will be issued.</li>
              <li className="flex gap-3"><span className="text-gold">·</span> You may cancel at any time; access continues until the end of the billing period.</li>
              <li className="flex gap-3"><span className="text-gold">·</span> We reserve the right to change pricing with 30 days notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">7. Intellectual Property & Confidentiality</h2>
            <p>
              The Coattail system — including but not limited to source code, trading strategies,
              wallet addresses, statistical models, and proprietary filters — is confidential
              and owned by Second State Records LLC. You agree not to:
            </p>
            <ul className="mt-4 space-y-2 ml-4">
              <li className="flex gap-3"><span className="text-paper">·</span> Reverse-engineer, decompile, or replicate the system.</li>
              <li className="flex gap-3"><span className="text-paper">·</span> Redistribute, resell, or sublicense access.</li>
              <li className="flex gap-3"><span className="text-paper">·</span> Share wallet addresses, strategy details, or proprietary data publicly.</li>
            </ul>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Second State Records LLC and its
              officers, employees, and affiliates shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, including but not
              limited to loss of profits, data, or trading capital, arising from your use
              of or inability to use Coattail.
            </p>
            <p className="mt-4">
              Our total liability for any claim arising from these Terms or your use of
              Coattail shall not exceed the amount you paid us in the 3 months preceding
              the claim.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">9. Termination</h2>
            <p>
              We may suspend or terminate your access at any time for violation of these
              Terms, with or without notice. You may cancel your subscription at any time
              through Stripe.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">10. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Commonwealth of Virginia.
              Any disputes shall be resolved in the courts of Charlottesville, Virginia.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">11. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of Coattail after
              changes constitutes acceptance. Material changes will be communicated via
              email or Discord.
            </p>
          </section>

          <section>
            <h2 className="display text-2xl text-paper mb-4">12. Contact</h2>
            <p>
              Questions about these Terms? Contact us:
            </p>
            <p className="mt-2">
              <a href="mailto:jarvismaxmorrish@gmail.com?subject=URGENT%20Coattail%20Legal" className="text-phosphor hover:underline mono">
                jarvismaxmorrish@gmail.com
              </a>
            </p>
            <p className="mono text-[10px] text-paper-muted mt-1">
              Second State Records LLC · Charlottesville, VA
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
