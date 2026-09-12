/**
 * The application's route table, plus the one piece of routing logic that has security consequences:
 * validating a redirect target that arrived from a query string.
 *
 * Pure and dependency-free on purpose — it is imported by Server Components, Server Actions, Route
 * Handlers, `proxy.ts` and the sign-in Client Component, so it may not import `server-only`,
 * `next/headers` or anything else that pins it to one runtime.
 */

/** URLs are pt-BR; identifiers are English. */
export const ROUTES = {
  publicHome: '/',
  adminHome: '/admin',
  adminRegistrations: '/admin/inscricoes',
  adminExport: '/admin/inscricoes/exportar',
  adminSettings: '/admin/configuracoes',
  adminTeam: '/admin/equipe',
  adminAudit: '/admin/auditoria',
  adminSignIn: '/admin/entrar',
  adminNoAccess: '/admin/sem-acesso',
  adminSession: '/admin/sessao',
  authConfirm: '/auth/confirmar',
  signOut: '/auth/sair',
} as const;

/** Where an interrupted sign-in lands when no valid destination survived validation. */
export const DEFAULT_ADMIN_DESTINATION: string = ROUTES.adminHome;

/**
 * The admin surfaces that must never be a post-sign-in destination: sending a freshly signed-in
 * administrator back to the sign-in page is a redirect loop, and `sem-acesso` is a dead end.
 */
const NON_DESTINATIONS: readonly string[] = [ROUTES.adminSignIn, ROUTES.adminNoAccess];

/** Long enough for any real admin URL with filters; short enough to bound the work below. */
const MAX_LENGTH = 512;

/** Path segments: unreserved characters only. Deliberately excludes `%`, `:`, `@` and backslash. */
const ADMIN_PATHNAME = /^\/admin(?:\/[A-Za-z0-9\-._~]+)*\/?$/;

/**
 * The whole candidate, before and after one round of decoding. `?`, `=`, `&`, `+` and `,` are
 * allowed so a filtered list URL survives; `#`, `:`, backslash, `<`, `>`, quotes and every control
 * character do not.
 */
const ALLOWED_CHARACTERS = /^[A-Za-z0-9\-._~%/?=&+,]*$/;

/**
 * Reduces an untrusted `next` parameter to an internal admin path, or to `/admin`.
 *
 * The rule is an allowlist, not a blocklist: the value must *be* an admin path, in both its raw and
 * its once-decoded form. That is what rejects the whole family of open-redirect encodings at once —
 * `https://evil.example`, `//evil.example`, `/\evil.example`, `%2F%2Fevil.example`,
 * `%252F%252Fevil.example`, `/admin/../../evil`, and anything carrying a control character or a
 * newline that could split a header.
 *
 * Both forms are checked because a browser normalises percent-encoding before following a
 * `Location`, so validating only the raw string would let an encoded external URL through, and
 * validating only the decoded string would let a double-encoded one through.
 */
export function safeAdminPath(candidate: string | null | undefined): string {
  if (typeof candidate !== 'string') return DEFAULT_ADMIN_DESTINATION;
  if (candidate.length === 0 || candidate.length > MAX_LENGTH) return DEFAULT_ADMIN_DESTINATION;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // A malformed escape sequence is never something we produced.
    return DEFAULT_ADMIN_DESTINATION;
  }

  for (const form of [candidate, decoded]) {
    if (!form.startsWith('/')) return DEFAULT_ADMIN_DESTINATION;
    // `//host` and `/\host` are protocol-relative URLs, not paths.
    if (form.startsWith('//') || form.startsWith('/\\')) return DEFAULT_ADMIN_DESTINATION;
    if (!ALLOWED_CHARACTERS.test(form)) return DEFAULT_ADMIN_DESTINATION;
  }

  const [pathname] = decoded.split(/[?#]/, 1);
  if (!ADMIN_PATHNAME.test(pathname)) return DEFAULT_ADMIN_DESTINATION;
  // `.` and `..` pass the segment character class and would climb out of /admin once normalised.
  if (pathname.split('/').some((segment) => segment === '.' || segment === '..')) {
    return DEFAULT_ADMIN_DESTINATION;
  }
  if (NON_DESTINATIONS.includes(pathname.replace(/\/$/, ''))) return DEFAULT_ADMIN_DESTINATION;

  // The raw form is returned, not the decoded one: it is proven safe and it preserves the encoding
  // of any query values.
  return candidate;
}

/**
 * Why the visitor is looking at the sign-in page. Rendered as copy (ADMIN-SPEC.md section 2), so the
 * set is closed — an unrecognised value shows no message rather than echoing a query parameter.
 */
export const SIGN_IN_REASONS = ['sessao-expirada', 'link-invalido'] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

/** Builds the sign-in URL that remembers where the visitor was going. */
export function signInPathFor(
  destination: string | null | undefined,
  reason?: SignInReason,
): string {
  const next = safeAdminPath(destination);
  const params = new URLSearchParams();
  if (next !== DEFAULT_ADMIN_DESTINATION) params.set('next', next);
  if (reason) params.set('motivo', reason);
  const query = params.toString();
  return query ? `${ROUTES.adminSignIn}?${query}` : ROUTES.adminSignIn;
}

export function signInReason(value: string | string[] | undefined): SignInReason | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SIGN_IN_REASONS.includes(candidate as SignInReason) ? (candidate as SignInReason) : null;
}
