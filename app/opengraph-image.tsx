/**
 * The social preview — PRODUCT-SPEC.md section 3.1.
 *
 * This page will mostly be opened from a link pasted into WhatsApp or Instagram, so the card that
 * link produces is part of the design rather than an afterthought. It is the hero's own lockup at
 * 1200 × 630: the kicker, the two-weight title, the `para jovens` pill, and the date and venue in
 * small type along the bottom.
 *
 * **Generated rather than photographed.** The poster is a 3:4 portrait and would letterbox badly in
 * a 1.91:1 card; a crop of it would cut the title in half. Rendering the type directly is sharper,
 * smaller, and stays correct if the event row changes.
 *
 * Satori (what `ImageResponse` runs on) supports flexbox and a subset of CSS — no grid, no
 * `clamp()`, no custom properties — so the values here are literal. They are the same tokens the
 * page uses, written out.
 *
 * **One adaptation, made deliberately.** The page's identity rests on a weight jump from 300 to 800
 * in a variable family (VISUAL-DIRECTION.md section 6.3); Satori renders with a bundled default
 * face that has no such range, and shipping a static Archivo binary purely for this one image would
 * put a font file in the repository and a decoding step in the build. So the card carries the same
 * hierarchy with the two axes it *does* have — size and the text tier — rather than rendering both
 * lines at the same weight and losing it entirely.
 */
import { ImageResponse } from 'next/og';

import { getActiveEventForDisplay } from '@/lib/data/public';
import { presentEvent } from '@/lib/domain/event-presentation';
import { client as publicEnv } from '@/lib/env';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Palestra — Educação Financeira para Jovens';

const INK_900 = '#070B1E';
const SKY_300 = '#71C1FC';
const BLUE_500 = '#1656C4';
const TEXT_SECONDARY = '#D4E7EF';

export default async function OpengraphImage() {
  const event = await getActiveEventForDisplay();
  const view = event ? presentEvent(event, publicEnv.NEXT_PUBLIC_SITE_URL) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: INK_900,
          padding: '72px 80px',
          color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {view?.kicker ? (
            <div
              style={{
                fontSize: 26,
                letterSpacing: 10,
                textTransform: 'uppercase',
                color: SKY_300,
                fontWeight: 700,
              }}
            >
              {view.kicker}
            </div>
          ) : null}

          {view?.titleLead ? (
            <div
              style={{
                fontSize: 62,
                marginTop: 26,
                lineHeight: 1,
                color: TEXT_SECONDARY,
                letterSpacing: -1,
              }}
            >
              {view.titleLead.toLowerCase()}
            </div>
          ) : null}

          <div style={{ fontSize: 138, fontWeight: 700, letterSpacing: -6, lineHeight: 1.02 }}>
            {view?.titleAccent ?? 'Financeira'}
          </div>

          {view?.audienceLabel ? (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                alignSelf: 'flex-start',
                backgroundColor: BLUE_500,
                borderRadius: 999,
                padding: '12px 34px',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 6,
                textTransform: 'uppercase',
              }}
            >
              {view.audienceLabel}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderTop: `1px solid #16255E`,
            paddingTop: 28,
            fontSize: 28,
            color: TEXT_SECONDARY,
          }}
        >
          <div style={{ display: 'flex' }}>
            {[view?.longDate, view?.timeRange].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex' }}>
            {[view?.venueName, view?.addressLines.at(-1)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
