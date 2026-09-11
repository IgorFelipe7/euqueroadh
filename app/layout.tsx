import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';

import { client as publicEnv } from '@/lib/env';

import './globals.css';

/*
 * One variable family for the whole product (VISUAL-DIRECTION.md section 6.1). The `wdth` axis is
 * what reproduces the banner's width contrast from a single file, so both axes are requested.
 * next/font self-hosts the file, which keeps `font-src 'self'` in the CSP honest, and generates a
 * metric-matched fallback that holds CLS at zero during the swap.
 */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  /*
   * Every relative URL in a `Metadata` object — the canonical link, `og:url`, the generated Open
   * Graph image — is resolved against this. Without it Next warns at build time and emits relative
   * social URLs, which no crawler can follow.
   */
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: 'Palestra — Educação Financeira para Jovens',
  description:
    'Palestra gratuita de educação financeira para jovens, em Hortolândia/SP. ' +
    '19 de setembro de 2026, das 19h às 21h, no Espaço Cezanne Eventos. Coffee break incluso.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#070b1e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={archivo.variable}>
      {/*
        The grain belongs to the public surface, not to the document: it is rendered by the public
        pages themselves (`components/site/grain.tsx`) rather than here, so the light admin subtree
        never inherits a texture designed for a navy field.
      */}
      <body>{children}</body>
    </html>
  );
}
