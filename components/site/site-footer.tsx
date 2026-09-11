/**
 * "Rodapé" — PRODUCT-SPEC.md section 4.1, VISUAL-DIRECTION.md section 5.3.
 *
 * One line. The event's own name and city on the left, the privacy link on the right, and nothing
 * else: no newsletter, no social icons (the organizers have supplied no accounts), no sitemap
 * column, no second copy of the CTA.
 *
 * The organizer names are **not** repeated here. Section 5.3 describes this footer as carrying
 * them, but the credits panel immediately above already does, in the banner's own structure —
 * printing all four twice in one screen would be exactly the "repeated section" the brief rejects.
 * The footer carries the fine print instead, which is what section 4.1 actually asks it to answer.
 */
import Link from 'next/link';

import type { EventPresentation } from '@/lib/domain/event-presentation';

import { CTA_TERTIARY } from './cta';

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
    </footer>
  );
}
