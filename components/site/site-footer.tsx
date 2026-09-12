/**
 * "Rodapé" — PRODUCT-SPEC.md section 4.1, VISUAL-DIRECTION.md section 5.3.
 *
 * The event's own name and city on the left, the privacy link on the right, and beneath them the
 * creator's signature. No newsletter, no social icons (the organizers have supplied no accounts),
 * no sitemap column, no second copy of the CTA.
 *
 * The organizer names are **not** repeated here. Section 5.3 describes this footer as carrying
 * them, but the credits panel immediately above already does, in the banner's own structure —
 * printing all four twice in one screen would be exactly the "repeated section" the brief rejects.
 * The footer carries the fine print instead, which is what section 4.1 actually asks it to answer.
 *
 * This is the **only** public footer in the application: `app/page.tsx` renders it, and
 * `/privacidade` closes with its own inline "voltar" link rather than a second implementation. The
 * admin has no footer and deliberately carries no credit.
 */
import Link from 'next/link';

import type { EventPresentation } from '@/lib/domain/event-presentation';

import { CTA_TERTIARY } from './cta';
import { GithubIcon } from './icons';

const CREATOR = 'Igor Felipe';
const CREATOR_GITHUB = 'https://github.com/IgorFelipe7';

export function SiteFooter({ event }: { readonly event: EventPresentation }) {
  const name = [event.kicker, [event.title, event.audienceLabel].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' — ');

  return (
    <footer className="border-t border-ink-600">
      <div className="u-shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-hint text-text-muted">
          {name}
          {event.addressLines.at(-1) ? ` · ${event.addressLines.at(-1)}` : ''}
        </p>

        <p className="text-hint">
          <Link href="/privacidade" className={CTA_TERTIARY}>
            Como usamos seus dados
          </Link>
        </p>
      </div>

      {/*
        The signature, at the absolute bottom.

        A separate row below a hairline rather than a fourth item in the line above, because it
        belongs to a different voice: the line above is the event's, this one is not. The label is a
        micro-label in `text-muted` and only the name carries weight, so the block reads as a
        signature rather than as a second credits panel — the `Realização` marks are a scroll up and
        must stay the loudest names on the page.

        **One link, not two.** The name and the `GitHub` affordance are a single anchor: the target
        is comfortable on a phone, the rule under the name is the affordance rather than a decoration
        beside one, and a keyboard user meets one stop here instead of two.

        `gold-400` appears nowhere in it. Section 3.4 rations the action colour to three places on
        the page, and a credit is not one of them; the accent here is `sky-300`, used as motion.
      */}
      <div className="u-shell border-t border-ink-600/60 pt-6 pb-8">
        <p className="text-micro-label text-text-muted uppercase">Desenvolvido por</p>

        <a
          href={CREATOR_GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Perfil de ${CREATOR} no GitHub (abre em nova aba)`}
          className="u-credit group mt-2 inline-flex flex-wrap items-baseline gap-x-4 gap-y-2 focus-visible:rounded-xs"
        >
          <span className="u-credit-underline text-h3 font-stretch-[102%] text-text-primary">
            {CREATOR}
          </span>

          {/*
            `min-h-6` sits on this row rather than on the anchor: the anchor is `items-baseline`, so
            a minimum height there would move the baseline instead of growing the box. This is the
            part a thumb aims at, and 24px is the floor in SC 2.5.8.
          */}
          <span className="text-hint u-settle inline-flex min-h-6 items-center gap-1.5 text-text-muted group-hover:text-text-secondary group-focus-visible:text-text-secondary">
            <GithubIcon size={15} />
            GitHub
            <span aria-hidden="true" className="u-credit-arrow">
              ↗
            </span>
          </span>
        </a>
      </div>
    </footer>
  );
}
