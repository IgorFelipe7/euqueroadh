import type { Metadata } from 'next';
import Link from 'next/link';

import { CertificateLookupForm } from '@/components/certificate-lookup-form';
import { CTA_TERTIARY } from '@/components/site/cta';
import { Grain } from '@/components/site/grain';
import { CERTIFICATE_COPY } from '@/lib/certificate/state';
import { certificatesEnabled } from '@/lib/data/public';
import { client as publicEnv } from '@/lib/env';

/**
 * `/certificado` — the one address the organizer posts to a WhatsApp group.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 4.6 used to say the organizer distributes three hundred individual
 * links. This page is the replacement for that plan, and it is an **identification layer over the
 * existing capability**, not a second way in: a successful lookup redirects to `/certificado/<token>`,
 * which is the same unguessable route the admin's copy-link has always produced. The tokenized links
 * remain valid and remain the fallback.
 *
 * ## Two states, and the order they are decided in
 *
 * Before the organizer flips `certificates_enabled`, this page renders one sentence and **mounts no
 * form at all** — so there is no input to submit and no lookup to attempt in the window between the
 * event ending and the switch being thrown (launch brief § 14). The Server Action re-checks the switch
 * itself, and `find_certificate` checks it a third time; this is the outermost of the three.
 *
 * After it, the page renders the two-field form and nothing else. No count, no list, no names.
 */

export const dynamic = 'force-dynamic';

/**
 * Never indexed.
 *
 * Unlike `/certificado/<token>`, this URL carries no capability and is meant to be shared — but it is
 * still an identification form over personal data, and a search result for it would be an invitation
 * to probe rather than a service to anybody. The organizer hands the address out directly.
 */
export const metadata: Metadata = {
  title: 'Certificados',
  robots: { index: false, follow: false, nocache: true },
};

export default async function CertificatePortalPage() {
  const enabled = await certificatesEnabled();

  return (
    <>
      <Grain />

      <main className="u-shell flex min-h-dvh max-w-[34rem] flex-col justify-center gap-8 py-10">
        <header className="flex flex-col gap-3">
          <p className="text-micro-label text-gold-400 uppercase">{CERTIFICATE_COPY.kicker}</p>

          {enabled ? (
            <>
              <h1 className="text-h2 font-stretch-[105%] text-balance text-text-primary">
                {CERTIFICATE_COPY.heading}
              </h1>
              <p className="text-body text-text-secondary">{CERTIFICATE_COPY.tagline}</p>
              <p className="text-hint text-text-muted">{CERTIFICATE_COPY.instruction}</p>
            </>
          ) : (
            <>
              <h1 className="text-h2 font-stretch-[105%] text-balance text-text-primary">
                {CERTIFICATE_COPY.disabled.heading}
              </h1>
              {CERTIFICATE_COPY.disabled.body.map((paragraph) => (
                <p key={paragraph} className="text-body text-text-secondary">
                  {paragraph}
                </p>
              ))}
            </>
          )}
        </header>

        {enabled ? (
          <CertificateLookupForm siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        ) : null}

        <p>
          <Link href="/" className={CTA_TERTIARY}>
            ← Palestra — Educação Financeira para Jovens
          </Link>
        </p>
      </main>
    </>
  );
}
