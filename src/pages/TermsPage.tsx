import type { ReactNode } from 'react';

const LAST_UPDATED = '2026-05-13';

export function TermsPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300 ring-1 ring-white/10">
          Legal
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tighter text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          Last updated · {LAST_UPDATED}
        </p>
        <p className="mt-5 text-sm leading-relaxed text-slate-300 sm:text-base">
          TOILETWIFHAT is a peer-to-peer skill-based arena shooter that lets players wager
          the $TOILET SPL token on Solana. By creating an account, joining a lobby, or
          opening a match — paid or free — you agree to the terms below.
        </p>
      </header>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100 ring-1 ring-amber-500/20 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300">
          Read carefully
        </p>
        <p className="mt-2">
          This product handles real-value crypto assets. You are responsible for every
          wager placed from your wallet. Read the wallet, wagering, and refund sections
          before you stake $TOILET.
        </p>
      </div>

      <div className="flex flex-col gap-7">
        <Section index={1} title="Eligibility">
          <p>
            You must be at least <strong className="text-white">18 years old</strong> and
            of legal age to participate in skill-based wagering in your jurisdiction. If
            wagering on outcomes of skill-based games is restricted or prohibited where
            you live, do not deposit, join paid lobbies, or stake tokens. By connecting a
            wallet to a paid match you represent that participation is lawful for you.
          </p>
          <p>
            The product is not intended for residents of any jurisdiction where its use
            would be unlawful. We may, without notice, restrict access from specific
            regions or IPs.
          </p>
        </Section>

        <Section index={2} title="Gameplay & Match Rules">
          <p>
            Each paid table is a 1v1, best-of-three round arena match. Player health
            resets between rounds; a player wins the match by taking two rounds.
            Forfeiting, intentionally disconnecting, or being eliminated counts as a loss
            of the match and the full wager.
          </p>
          <p>
            Server-side validation is authoritative. The client interpolates positions
            and renders effects, but health, round wins, and match outcomes are decided
            by the game server. Disputes about who hit whom on screen are not grounds for
            reversing a settled match.
          </p>
          <p>
            Use of automation, aim assistance, packet manipulation, or any tool that
            interferes with the protocol is prohibited and will result in match
            forfeiture and account suspension.
          </p>
        </Section>

        <Section index={3} title="Wagering & Stakes">
          <p>
            Paid lobbies are offered at fixed stakes of{' '}
            <span className="font-mono font-bold text-emerald-300">100</span>,{' '}
            <span className="font-mono font-bold text-emerald-300">500</span>, and{' '}
            <span className="font-mono font-bold text-emerald-300">1,000</span> $TOILET.
            When you join a match, your stake is locked for the duration of the match.
            The winner receives the combined pot, less any applicable protocol fees
            disclosed at the time settlement is enabled.
          </p>
          <p>
            Stakes are denominated in the $TOILET SPL token and settled on the Solana
            network. Network fees (gas, priority fees) are paid by the wallet initiating
            the transaction. We do not subsidize, refund, or reimburse network fees.
          </p>
          <p>
            Until on-chain settlement is live, all "paid" matches and any pot amounts
            shown in the UI are placeholders. No real-token transfer occurs while the
            product is in this state, and players retain full custody of any $TOILET
            balance shown in their wallet.
          </p>
        </Section>

        <Section index={4} title="Wallet Responsibility">
          <p>
            TOILETWIFHAT is a non-custodial product. We never take possession of, control,
            or have access to your wallet's private keys, seed phrase, or signed
            transactions other than those you authorize through your wallet provider.
          </p>
          <p>
            You alone are responsible for:
          </p>
          <ul className="list-inside list-disc space-y-1.5 pl-2 marker:text-emerald-400/70">
            <li>Securing your private keys, seed phrase, and wallet device.</li>
            <li>Reviewing every transaction your wallet prompts you to sign.</li>
            <li>Ensuring your wallet holds enough SOL to cover network fees.</li>
            <li>Connecting only to the official TOILETWIFHAT domain.</li>
          </ul>
          <p>
            Loss of access to your wallet, signed transactions sent to a phishing site,
            or transfers to an incorrect address are not recoverable through us.
          </p>
        </Section>

        <Section index={5} title="No Refunds">
          <p>
            All wagers, in-game upgrades, and on-chain transfers are{' '}
            <strong className="text-white">final and non-refundable</strong>. Once a
            match begins and a stake is locked, the outcome — won, lost, or forfeited —
            settles automatically per the rules in Section 2. We do not reverse settled
            matches based on lag, hardware issues, lost internet connection,
            keyboard/mouse failure, or unintentional clicks.
          </p>
          <p>
            If the game server experiences a verifiable outage that prevents a match from
            being settled at all, we may credit affected players by re-running the match
            or returning locked stakes at our discretion. This is the only circumstance
            under which a refund-like remedy applies.
          </p>
        </Section>

        <Section index={6} title="Cryptocurrency Volatility & Risk">
          <p>
            $TOILET, SOL, and any associated tokens are volatile assets whose value can
            change significantly — including to zero — over short periods. By staking
            $TOILET you accept the risk that the token's value may decrease before,
            during, or after a match.
          </p>
          <p>
            TOILETWIFHAT does not offer investment advice. Nothing on this site
            constitutes a recommendation to buy, hold, or sell any crypto asset. Wager
            only what you can afford to lose.
          </p>
        </Section>

        <Section index={7} title="Limitation of Liability">
          <p>
            The product is provided "as is" and "as available" without warranty of any
            kind. To the maximum extent permitted by law, the TOILETWIFHAT team and its
            contributors are not liable for indirect, incidental, consequential, or
            exemplary damages — including loss of tokens, profits, opportunity, or data
            — arising from your use of the service.
          </p>
          <p>
            Our aggregate liability for any direct claim is limited to the value of the
            stakes you have placed within the 30 days before the claim, capped at the
            equivalent of one match's pot at the highest published stake tier.
          </p>
        </Section>

        <Section index={8} title="Changes & Contact">
          <p>
            We may update these terms as the product evolves — new game modes, fee
            structures, or regulatory requirements may require revisions. Material
            changes will be reflected by an updated "Last updated" date and, where
            possible, a notice on the lobby. Continued use of the product after changes
            take effect indicates acceptance.
          </p>
          <p>
            Questions, security disclosures, or legal notices can be sent to{' '}
            <span className="font-mono text-emerald-300">team@toiletwifhat.gg</span>.
          </p>
        </Section>
      </div>

      <footer className="mt-2 rounded-2xl border border-white/5 bg-slate-900/40 px-5 py-4 text-xs leading-relaxed text-slate-500">
        By joining a paid match, you confirm you have read these terms, are 18 or older,
        and accept the risks of wagering on a Solana-based product.
      </footer>
    </article>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-8" id={`s-${index}`}>
      <header className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400/80">
          §{index.toString().padStart(2, '0')}
        </span>
        <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
          {title}
        </h2>
      </header>
      <div className="space-y-3 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}
