/**
 * The public event page.
 *
 * **Composition only.** Each region is its own component under `components/site/`; this file
 * decides the order, resolves the event once, and owns nothing else. The page reads as a single
 * narrative rather than as a stack of equal rectangles — impact, orientation, context, the facts,
 * the form, the credits — and no two sections share the same padding, width or surface, which is
 * what section 4.2 means by rhythm.
 *
 * A Server Component, and it stays one. The client islands are exactly the five listed in
 * ARCHITECTURE.md section 5 — the form, the sticky CTA, the reveal observer, the journey controller
 * and the counting rail's pointer — so every *fact* on this page costs the browser no JavaScript at
 * all. The last three exist for motion and are additive to the last byte: none of them renders
 * anything, and with scripting off the page is complete without them.
 *
 * **The state shown here is advisory** (PRODUCT-SPEC.md section 4.4). It is read at render time and
 * served from a 60-second cache, so a visitor can arrive from a stale copy and still be waitlisted
 * or refused — the database decides at submit time and every one of those answers has a screen.
 * The page communicates state, never numbers: no counter, no "faltam 3 vagas".
 */
import type { Metadata } from 'next';

import { Credits } from '@/components/site/credits';
import { Details } from '@/components/site/details';
import { FinancialJourney } from '@/components/site/financial-journey';
import { Grain } from '@/components/site/grain';
import { Hero, HERO_CTA_ID } from '@/components/site/hero';
import { Invitation } from '@/components/site/invitation';
import { JourneyDefs } from '@/components/site/journey';
import { RailPointer } from '@/components/site/rail-pointer';
import { RegistrationSection } from '@/components/site/registration-section';
import { Reveal } from '@/components/site/reveal';
import { SiteFooter } from '@/components/site/site-footer';
import { StickyCta } from '@/components/site/sticky-cta';
import { getActiveEventForDisplay } from '@/lib/data/public';
import { presentEvent } from '@/lib/domain/event-presentation';
import { PUBLIC_STATE_COPY, acceptsRegistrations } from '@/lib/domain/outcomes';
import { client as publicEnv } from '@/lib/env';

/**
 * ISR. The page is almost entirely static event facts, and serving prerendered HTML from the CDN is
 * what makes the LCP budget reachable; the window bounds how stale the advisory banner can be. The
 * registration action revalidates on demand when an allocation actually changes that state
 * (ARCHITECTURE.md section 4).
 */
export const revalidate = 60;

const REGISTRATION_ANCHOR = 'inscricao';

/**
 * The social preview. Built from the event row rather than from the layout's constants, so the
 * canonical URL and the description cannot drift from what the page actually says.
 */
export async function generateMetadata(): Promise<Metadata> {
  const event = await getActiveEventForDisplay();
  if (!event) return {};

  const view = presentEvent(event, publicEnv.NEXT_PUBLIC_SITE_URL);
  const name = [view.kicker, [view.title, view.audienceLabel].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' — ');
  const description = [
    [view.longDate, view.timeRange].filter(Boolean).join(', '),
    [view.venueName, view.addressLines.at(-1)].filter(Boolean).join(', '),
    [view.priceLabel, view.includesLabel].filter(Boolean).join('. '),
  ]
    .filter((part) => part.length > 0)
    .join('. ')
    .concat('.');

  return {
    title: name,
    description,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: name,
      title: name,
      description,
      url: '/',
    },
    twitter: { card: 'summary_large_image', title: name, description },
  };
}

export default async function Home() {
  const event = await getActiveEventForDisplay();

  if (!event) {
    // The event could not be read. Never a database sentence, never a stack frame.
    return (
      <main className="u-shell flex min-h-[60svh] max-w-[62ch] flex-col justify-center gap-4 py-16">
        <h1 className="text-h2 text-text-primary">Palestra — Educação Financeira para Jovens</h1>
        <p className="text-body">
          Não conseguimos carregar as informações do evento agora. Tente novamente em instantes.
        </p>
      </main>
    );
  }

  const view = presentEvent(event, publicEnv.NEXT_PUBLIC_SITE_URL);
  const { banner, cta } = PUBLIC_STATE_COPY[event.state];
  const accepting = acceptsRegistrations(event.state);

  return (
    <>
      {/* The first focusable element on the page, and the one every CTA also points at. */}
      <a
        href={`#${REGISTRATION_ANCHOR}`}
        className="text-label sr-only rounded-full focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-40 focus:border focus:border-sky-300 focus:bg-ink-800 focus:px-5 focus:py-3 focus:text-text-primary"
      >
        Ir para a inscrição
      </a>

      <main id="conteudo">
        <Hero
          event={view}
          banner={banner}
          cta={cta}
          registrationAnchor={REGISTRATION_ANCHOR}
        />

        <Invitation event={view} />

        <Details event={view} />

        <RegistrationSection
          event={view}
          anchor={REGISTRATION_ANCHOR}
          siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          accepting={accepting}
          unavailableMessage={banner}
        />

        <Credits />
      </main>

      <SiteFooter event={view} />

      {/*
        The four client islands that exist for behaviour rather than for content. All four are
        additive: with JavaScript off, the reveal never hides anything, the journey line is simply
        never drawn, the counting rail sits at the composition it was drawn as and the sticky bar
        never appears — the hero CTA and the form are both still there, and every fact on the page is
        still printed.

        One clear model between them, and no overlap (VISUAL-DIRECTION.md sections 7.4 and 10.8):
        the hero's entrance — the type's and the counting rail's alike — is pure CSS and needs no
        island at all; `Reveal` handles arrival, one observer, once per section; `FinancialJourney`
        handles progression, one measurement and one frame loop for the single line that crosses the
        whole page, and the counting rail's two bead movements ride on that same loop rather than
        bringing a second one; `RailPointer` handles the pointer, on a fine pointer at `lg` only, and
        writes two numbers. Nothing else animates.
      */}
      <Reveal />
      <FinancialJourney />
      <RailPointer />

      {/* The head's bloom, declared once for every segment on the page (section 10.9). */}
      <JourneyDefs />
      {cta ? (
        <StickyCta label={cta} targetId={REGISTRATION_ANCHOR} heroCtaId={HERO_CTA_ID} />
      ) : null}

      <Grain />
    </>
  );
}
