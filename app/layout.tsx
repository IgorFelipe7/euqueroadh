import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';

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
  title: 'Palestra — Educação Financeira para Jovens',
  description:
    'Palestra gratuita de educação financeira para jovens, em Hortolândia/SP. ' +
    '19 de setembro de 2026, das 19h às 21h, no Espaço Cezanne Eventos. Coffee break incluso.',
  // metadataBase, the canonical URL and the Open Graph tags depend on NEXT_PUBLIC_SITE_URL and
  // arrive with the public page (Phase 5), which is what gives them something to point at.
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
      <body>{children}</body>
    </html>
  );
}
