/**
 * The admin Content-Security-Policy: the strict, per-request-nonce half of the two profiles in
 * ARCHITECTURE.md section 9.3.
 *
 * The public profile is a static string in `next.config.ts` and keeps `'unsafe-inline'` for scripts,
 * because a nonce must be unique per response and would therefore give up the ISR the LCP budget
 * depends on (D21). That trade is acceptable on `/` precisely because it renders no user-generated
 * HTML. The admin does render participant-supplied names, so it pays the dynamic-rendering cost and
 * gets the nonce.
 *
 * Kept pure and framework-free so it can be asserted directly in a unit test — a CSP that silently
 * loses `'strict-dynamic'`, or silently gains `'unsafe-inline'`, is exactly the kind of regression
 * that no one notices in a browser.
 */

export interface CspOptions {
  /**
   * React uses `eval` in development to reconstruct server stacks, and Next's dev overlay needs it
   * too. Never true in a production build.
   */
  readonly development: boolean;
}

/**
 * Differences from the public profile, each deliberate:
 *
 *   * `script-src` carries the nonce and `'strict-dynamic'` and drops `'unsafe-inline'` entirely;
 *   * Cloudflare's Turnstile origins are absent — the widget exists only on the public form, and an
 *     origin nobody uses is an origin that should not be allowed;
 *   * `frame-src 'none'` for the same reason.
 *
 * `style-src` keeps `'unsafe-inline'`: it covers inline `style` attributes, which React emits for
 * ordinary component styling, and tightening it would break rendering without closing a script
 * execution path.
 */
export function adminContentSecurityPolicy(nonce: string, options: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(options.development ? ["'unsafe-eval'"] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * 128 bits from the platform CSPRNG, base64-encoded. Unique per response and unpredictable, which
 * is the whole security property a nonce has.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Identity-dependent HTML must never be stored by a CDN, a reverse proxy or the browser's back/
 * forward cache in a way another person could read. Applied to every admin response.
 */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};
