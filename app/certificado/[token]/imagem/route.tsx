import { ImageResponse } from 'next/og';

import {
  CERTIFICATE_SIZES,
  CertificateArt,
  certificateFonts,
} from '@/app/certificado/[token]/certificate-art';
import { getCertificate } from '@/lib/data/public';
import { presentCertificate } from '@/lib/domain/certificate';
import { client as publicEnv } from '@/lib/env';

/**
 * `/certificado/<token>/imagem` — the A4 landscape sheet, 2000 × 1414.
 *
 * PNG rather than PDF, deliberately (RAFFLE-AND-CERTIFICATE-SPEC.md § 4.4): the audience is young
 * people on phones, and a PNG saves to the gallery in one tap, sends on WhatsApp and posts to a
 * story. A vector PDF would mean a second layout engine and a new dependency for a format most of
 * this audience will never open — and the page's print stylesheet already produces one through the
 * browser for anyone who wants it.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const certificate = await getCertificate(decodeURIComponent(token));

  // The same blank answer for every negative case — unknown token, not present, switch off — so
  // this route cannot be used to tell them apart any more than the page can (§ 4.3).
  if (!certificate) {
    return new Response('Não encontrado', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const view = presentCertificate(certificate);
  const { width, height } = CERTIFICATE_SIZES.sheet;

  return new ImageResponse(
    (
      <CertificateArt
        view={view}
        format="sheet"
        siteHost={new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host}
      />
    ),
    {
      width,
      height,
      fonts: await certificateFonts(),
      headers: {
        /*
         * One named person's document, reachable by a capability in the URL. Nothing may store it:
         * not a shared CDN, not a corporate proxy, not the browser's disk cache on a phone that is
         * lent to someone else.
         *
         * `no-store` alone, with no `max-age`. An earlier revision paired the two — `private,
         * max-age=3600, no-store` — which is self-contradictory: RFC 9111 § 5.2.2.5 makes
         * `no-store` win, so the freshness lifetime was dead and the comment justifying it was
         * describing behaviour that never happened. Re-rendering the image on a second tap is
         * cheap; being wrong about where a personal document is stored is not.
         */
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Content-Disposition': `inline; filename="${view.fileName}.png"`,
      },
    },
  );
}
