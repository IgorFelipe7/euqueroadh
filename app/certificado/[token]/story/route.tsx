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
 * `/certificado/<token>/story` — 1080 × 1920.
 *
 * The same composition at the other aspect ratio. This is the version that leaves the site: it is
 * what a nineteen-year-old actually does with a certificate, and it carries the event's identity and
 * date into feeds the organizers could not otherwise reach (RAFFLE-AND-CERTIFICATE-SPEC.md § 4.4).
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const certificate = await getCertificate(decodeURIComponent(token));

  if (!certificate) {
    return new Response('Não encontrado', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const view = presentCertificate(certificate);
  const { width, height } = CERTIFICATE_SIZES.story;

  return new ImageResponse(
    (
      <CertificateArt
        view={view}
        format="story"
        siteHost={new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host}
      />
    ),
    {
      width,
      height,
      fonts: await certificateFonts(),
      headers: {
        // As for the sheet: `no-store` and nothing that contradicts it. See `imagem/route.tsx`.
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Content-Disposition': `inline; filename="${view.fileName}-story.png"`,
      },
    },
  );
}
