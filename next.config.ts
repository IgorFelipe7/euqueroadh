import type { NextConfig } from 'next';

/**
 * The public Content-Security-Policy (ARCHITECTURE.md section 9.3).
 *
 * `'unsafe-inline'` in `script-src` is a deliberate, documented trade-off confined to the public
 * routes: a nonce must be unique per response, which would force dynamic rendering on `/` and give
 * up the ISR that the LCP budget depends on. It is acceptable here only because these routes render
 * no user-generated HTML — every string is a compile-time constant or a database value escaped by
 * React, and `dangerouslySetInnerHTML` is banned repository-wide.
 *
 * The admin routes render participant-supplied names and therefore get the strict per-request
 * nonce policy from `proxy.ts` instead. That is why this header is scoped away from `/admin`
 * below rather than applied to every route.
 */
const publicContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/** Applied to every response, admin included. */
const baselineHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  // The compute region is NOT configured here — Vercel does not read one from this file. It lives
  // in vercel.json (ARCHITECTURE.md section 10.1).
  poweredByHeader: false,
  /*
   * The certificate images render type with `next/og`, which needs the font bytes at request time.
   * A `readFile` from `process.cwd()` is invisible to the module tracer, so the two static Archivo
   * faces would be absent from the deployed function and the certificate would silently fall back
   * to a face with no weight range — the exact hierarchy the design depends on
   * (RAFFLE-AND-CERTIFICATE-SPEC.md section 4.4). This is the documented way to say so.
   */
  outputFileTracingIncludes: {
    '/certificado/[token]/imagem': ['./assets/fonts/**'],
    '/certificado/[token]/story': ['./assets/fonts/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: baselineHeaders,
      },
      {
        // Everything except /admin and its descendants.
        source: '/((?!admin(?:/|$)).*)',
        headers: [{ key: 'Content-Security-Policy', value: publicContentSecurityPolicy }],
      },
    ];
  },
};

export default nextConfig;
