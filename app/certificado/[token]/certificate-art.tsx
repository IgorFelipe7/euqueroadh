import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CertificateView } from '@/lib/domain/certificate';

/**
 * The certificate, drawn — RAFFLE-AND-CERTIFICATE-SPEC.md § 4.5.
 *
 * One composition, two aspect ratios: an A4 landscape sheet to keep or print, and a 1080 × 1920
 * story. The story is not a bonus — it is the version that leaves the site, carrying the event's
 * identity and date into feeds the organizers could not otherwise reach.
 *
 * **The banner, read as a document.** Navy field, one light source, the two-weight display
 * relationship the identity rests on (`educação` at 300 against `Financeira` at 800), and the blue
 * panel along the foot carrying `REALIZAÇÃO` and `APOIO` — the structure the banner itself uses.
 *
 * **The chart is the rule under the name.** It is simultaneously the event's subject, the identity's
 * signature element, and the structural line a certificate needs beneath its recipient. Ornament
 * doing three jobs is not ornament (VISUAL-DIRECTION.md § 1.7).
 *
 * Satori renders flexbox and a subset of CSS — no grid, no `clamp()`, no custom properties — so
 * every value here is literal. They are the tokens of `globals.css`, written out.
 */

const INK_900 = '#070B1E';
const BLUE_500 = '#1656C4';
const SKY_300 = '#71C1FC';
const GOLD_400 = '#FFC400';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#D4E7EF';
const TEXT_MUTED = '#9FB3D9';

/** The banner's own credit rows, in the banner's order (EVENT-SOURCE-OF-TRUTH.md § 6). */
const ORGANIZERS = ['Marcados pela Graça', 'Ministério Teen', 'Assembleia de Deus — Belém'];
const SUPPORTERS = ['Sicredi'];

export const CERTIFICATE_SIZES = {
  /** √2 landscape. ~170 dpi at A4 — sharp printed, and still a file a phone will open. */
  sheet: { width: 2000, height: 1414 },
  /** The story. */
  story: { width: 1080, height: 1920 },
} as const;

export type CertificateFormat = keyof typeof CERTIFICATE_SIZES;

/**
 * The two static faces.
 *
 * Instanced from the Archivo variable font with `fontTools` (see `assets/fonts/README.md`), because
 * Satori cannot select a weight along a variable axis and the 400/800 jump **is** the identity.
 * Shipping them is a build asset, not a dependency.
 *
 * Read once per process: a module-level promise, so a burst of downloads after the event does not
 * re-read 240 KB from disk for each one.
 */
let fontsPromise: Promise<{ regular: Buffer; extraBold: Buffer }> | null = null;

function loadFonts(): Promise<{ regular: Buffer; extraBold: Buffer }> {
  fontsPromise ??= (async () => {
    const directory = path.join(process.cwd(), 'assets', 'fonts');
    const [regular, extraBold] = await Promise.all([
      readFile(path.join(directory, 'Archivo-Regular.ttf')),
      readFile(path.join(directory, 'Archivo-ExtraBold.ttf')),
    ]);
    return { regular, extraBold };
  })();

  return fontsPromise;
}

export async function certificateFonts() {
  const { regular, extraBold } = await loadFonts();

  return [
    { name: 'Archivo', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Archivo', data: extraBold, weight: 800 as const, style: 'normal' as const },
  ];
}

/** The chart line, as the rule. Drawn, never plotted — there is no series behind it. */
function ChartRule({ width, opacity = 0.5 }: { width: number; opacity?: number }) {
  return (
    <svg width={width} height={Math.round(width * 0.055)} viewBox="0 0 1000 55" fill="none">
      <path
        d="M0 47 L104 39 L182 44 L288 25 L378 34 L472 16 L560 27 L668 9 L760 20 L856 5 L1000 13"
        stroke={SKY_300}
        strokeWidth="3"
        strokeLinejoin="round"
        opacity={opacity}
      />
    </svg>
  );
}

function CreditColumn({
  label,
  names,
  scale,
}: {
  label: string;
  names: readonly string[];
  scale: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 * scale }}>
      <div
        style={{
          fontSize: 15 * scale,
          fontWeight: 800,
          letterSpacing: 2.4 * scale,
          color: '#BBD3F5',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 * scale }}>
        {names.map((name) => (
          <div key={name} style={{ fontSize: 20 * scale, fontWeight: 800, color: TEXT_PRIMARY }}>
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The composition.
 *
 * `scale` carries the two formats: the story is narrower, so every size is derived from one number
 * rather than from a second set of literals that could drift away from the first.
 */
export function CertificateArt({
  view,
  format,
  siteHost,
}: {
  view: CertificateView;
  format: CertificateFormat;
  /**
   * The event's host — `euqueroadh.com` — and deliberately NOT this certificate's own URL.
   *
   * The link carries the access token, and the story format exists to be posted publicly. Printing
   * the token on the image would hand the recipient's certificate to everyone who saw their
   * Instagram story, which defeats the entire point of an unguessable capability
   * (RAFFLE-AND-CERTIFICATE-SPEC.md section 4.1).
   */
  siteHost: string;
}) {
  const story = format === 'story';
  const { width, height } = CERTIFICATE_SIZES[format];

  const scale = story ? 1 : 1.35;
  const pad = story ? 72 : 110;

  /*
   * The recipient's name is the only display-size element, and it is sized to fit the narrower
   * format first, so a long Brazilian name is never shrunk by the renderer.
   *
   * The story is set larger relative to its frame than the sheet: at 1080 × 1920 the content is
   * short and the composition is mostly air, so the subject has to command the frame or the whole
   * thing reads as a gap rather than as the deliberate emptiness of VISUAL-DIRECTION.md § 4.3.
   */
  const nameSize = story ? 104 : 132;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: INK_900,
        padding: pad,
        position: 'relative',
        fontFamily: 'Archivo',
      }}
    >
      {/* The single light source. One radial gradient, behind the name, exactly as the page has. */}
      <div
        style={{
          position: 'absolute',
          top: story ? height * 0.12 : -height * 0.34,
          left: story ? -width * 0.25 : width * 0.18,
          width: width * 1.2,
          height: width * 1.2,
          backgroundImage: `radial-gradient(circle at center, rgba(113,193,252,0.13) 0%, rgba(113,193,252,0.05) 38%, rgba(113,193,252,0) 68%)`,
        }}
      />

      {/* ------------------------------------------------------------------------------------------
        * The kicker, with the one gold mark on the whole document.
        * --------------------------------------------------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 * scale }}>
        <div style={{ width: 5 * scale, height: 28 * scale, backgroundColor: GOLD_400 }} />
        <div
          style={{
            fontSize: 20 * scale,
            fontWeight: 800,
            letterSpacing: 4 * scale,
            color: SKY_300,
          }}
        >
          {view.kicker}
        </div>
      </div>

      {/* ------------------------------------------------------------------------------------------
        * The subject: one name, with room around it.
        * --------------------------------------------------------------------------------------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * scale }}>
        {/*
          The identity's weight jump, applied to the recipient: the given name at 400, everything
          after it at 800 — the same relationship the banner sets between `educação` and
          `Financeira`. Wrapping is allowed, because a four-part Brazilian name must never be cut.
        */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            fontSize: nameSize,
            lineHeight: 1.02,
            letterSpacing: -nameSize * 0.03,
            color: TEXT_PRIMARY,
            maxWidth: width - pad * 2,
          }}
        >
          <span style={{ fontWeight: 400 }}>{view.given}</span>
          {view.family ? <span style={{ fontWeight: 800 }}>&nbsp;{view.family}</span> : null}
        </div>

        <ChartRule width={Math.min(width - pad * 2, story ? 900 : 1300)} />

        <div
          style={{
            display: 'flex',
            fontSize: 27 * scale,
            lineHeight: 1.45,
            color: TEXT_SECONDARY,
            maxWidth: story ? 900 : 1200,
          }}
        >
          {view.statement}
        </div>
      </div>

      {/* ------------------------------------------------------------------------------------------
        * The credits panel — the banner's own structure and its own labels.
        * --------------------------------------------------------------------------------------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 * scale }}>
        <div
          style={{
            display: 'flex',
            flexDirection: story ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: 28 * scale,
            backgroundColor: BLUE_500,
            borderRadius: 20 * scale,
            padding: `${28 * scale}px ${34 * scale}px`,
          }}
        >
          <CreditColumn label="REALIZAÇÃO" names={ORGANIZERS} scale={scale} />
          <CreditColumn label="APOIO" names={SUPPORTERS} scale={scale} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: story ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: 8 * scale,
            fontSize: 17 * scale,
            color: TEXT_MUTED,
          }}
        >
          <div style={{ display: 'flex' }}>
            {view.dateLabel}
            {view.timeLabel ? ` · ${view.timeLabel}` : ''}
          </div>
          <div style={{ display: 'flex' }}>{siteHost}</div>
        </div>
      </div>
    </div>
  );
}
