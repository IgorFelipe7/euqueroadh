/**
 * Nothing privileged may reach a browser: not the secret key, not a session token, not the module
 * that holds the key (ARCHITECTURE.md § 2, DATABASE-SECURITY.md § 8.6).
 *
 * The suite runs against the built application, so the assets it reads are the ones `next build`
 * actually emitted, not a dev-server approximation.
 *
 * Four checks, each covering a different way the boundary could break:
 *
 *   1. **The build output.** Every file under `.next/static` — the whole client bundle, including
 *      chunks this session never loads — is searched for the secret key's value.
 *   2. **What the browser actually received.** The admin page's HTML and every script it loads,
 *      fetched back with the administrator's own session, searched for the same value and for the
 *      session cookies' contents. That is the "no access or refresh token was serialised" check:
 *      the tokens exist, and the comparison uses their real values rather than a guess at their
 *      shape.
 *   3. **Page JavaScript cannot read the session.** `document.cookie` is empty of auth cookies
 *      because `@supabase/ssr` is configured `httpOnly` here (`cookie-bound.ts`).
 *   4. **The import itself is impossible.** Every module under `lib/data/` opens with
 *      `import 'server-only'`, whose package resolves to a throwing module outside the
 *      `react-server` condition — so a Client Component importing one fails `next build` rather
 *      than shipping it. Asserting the marker is asserting the mechanism; a missing marker is the
 *      only way this could silently regress.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { LOCAL, authCookies, createActiveAdmin, signIn, testEmail } from './support/local';

const TEXTUAL = /\.(js|mjs|cjs|css|json|txt|map)$/;

function filesUnder(directory: string, matching: RegExp): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, matching);
    return matching.test(entry.name) ? [path] : [];
  });
}

test('the secret key is absent from every client asset the build emitted', async () => {
  const staticDir = resolve(process.cwd(), '.next/static');
  const files = filesUnder(staticDir, TEXTUAL);

  expect(files.length, 'the application must have been built before this suite runs').toBeGreaterThan(
    0,
  );

  const offenders = files.filter((path) => {
    const source = readFileSync(path, 'utf8');
    return (
      source.includes(LOCAL.secretKey) ||
      source.includes('SUPABASE_SECRET_KEY') ||
      source.includes('TURNSTILE_SECRET_KEY')
    );
  });

  expect(offenders, 'a privileged value reached the client bundle').toEqual([]);
});

test('an administrator session never serialises the key or its tokens into the page', async ({
  page,
}) => {
  const email = testEmail('admin-bundle');
  await createActiveAdmin(email);

  await signIn(page, email);
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Área de organizadores' })).toBeVisible();

  const cookies = await authCookies(page);
  expect(cookies.length).toBeGreaterThan(0);

  // The raw server response, which carries the RSC payload inside its script tags — not the DOM,
  // which would have dropped it.
  const html = await (await page.request.get('/admin')).text();

  const scriptUrls = await page.$$eval('script[src]', (tags) =>
    tags.map((tag) => (tag as HTMLScriptElement).src),
  );
  expect(scriptUrls.length, 'the admin page is expected to load its own JavaScript').toBeGreaterThan(
    0,
  );

  const payloads = [html];
  for (const url of scriptUrls) {
    payloads.push(await (await page.request.get(url)).text());
  }

  for (const payload of payloads) {
    expect(payload).not.toContain(LOCAL.secretKey);
    expect(payload).not.toContain('SUPABASE_SECRET_KEY');

    for (const cookie of cookies) {
      // The chunked cookie value in full, and a long prefix of it, so an encoded fragment of the
      // token cannot slip past an exact-match comparison.
      expect(payload).not.toContain(cookie.value);
      expect(payload).not.toContain(decodeURIComponent(cookie.value).slice(0, 48));
    }
  }

  // And the session is unreadable from page JavaScript at all.
  const visibleCookies = await page.evaluate(() => document.cookie);
  expect(visibleCookies).not.toContain('auth-token');
  for (const cookie of cookies) expect(visibleCookies).not.toContain(cookie.name);
});

test('every Data Access Layer module is marked server-only', async () => {
  const dal = resolve(process.cwd(), 'lib/data');
  const modules = filesUnder(dal, /\.ts$/);

  expect(modules.length).toBeGreaterThan(0);

  for (const path of modules) {
    const source = readFileSync(path, 'utf8');
    const firstImport = /^\s*import .*$/m.exec(source)?.[0] ?? '';
    expect(firstImport.trim(), `${path} must open with the server-only marker`).toBe(
      "import 'server-only';",
    );
  }
});
