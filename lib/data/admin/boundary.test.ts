/**
 * Two structural guards for the admin's write path, checked against the source rather than against
 * behaviour.
 *
 * Both exist because the failure mode is silent. A Server Action added without `assertAdmin()` works
 * perfectly for an administrator and is an open endpoint for everyone else; a PostgREST `update()`
 * added to the DAL reads like ordinary code and quietly bypasses the lock order and the audit write
 * that make invariants I6 and I9 hold. Neither shows up in a unit test of the module itself, and
 * neither is a type error.
 *
 * IMPLEMENTATION-PLAN.md Phase 6 asks for exactly this check — "grep the finished phase for
 * `assertAdmin` and confirm the count matches the number of admin entry points". This is that grep,
 * run by `npm test` rather than by a person at the end of a phase.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ADMIN_ROUTES = resolve(ROOT, 'app', 'admin');
const ADMIN_DAL = resolve(ROOT, 'lib', 'data', 'admin');

const USE_SERVER = /^\s*(['"])use server\1\s*;/m;
const HTTP_METHOD = /export async function (GET|POST|PUT|PATCH|DELETE)/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

/** Repo-relative, forward-slashed, so a failure message is readable on any platform. */
function relative(path: string): string {
  return path.slice(ROOT.length).split('\\').join('/');
}

const adminSources = filesUnder(ADMIN_ROUTES);

/**
 * The `(auth)` route group is the deliberate exception, and the only one.
 *
 * `/admin/entrar` is the sign-in form: it is public by necessity, and an authorization check on it
 * would be a locked door with the key inside. Authorization happens on the *next* request, in
 * `requireAdmin()` — which is why a deactivated administrator can still sign in and still gets
 * nowhere. It is named here so that an unauthenticated action appearing anywhere else is a test
 * failure rather than a silent decision.
 */
const PUBLIC_BY_DESIGN = '/app/admin/(auth)/';

const isProtected = (path: string) => !relative(path).startsWith(PUBLIC_BY_DESIGN);

/** A `'use server'` module — every export of it is a POST endpoint. */
const serverActionModules = adminSources
  .filter(isProtected)
  .filter((path) => USE_SERVER.test(readFileSync(path, 'utf8')));

/** A Route Handler — `route.ts` exporting an HTTP method. */
const routeHandlers = adminSources
  .filter(isProtected)
  .filter((path) => path.endsWith('route.ts') && HTTP_METHOD.test(readFileSync(path, 'utf8')));

describe('every admin server entry point is behind the authorization gate', () => {
  it('finds entry points at all, so this cannot pass by scanning nothing', () => {
    expect(serverActionModules.length).toBeGreaterThan(0);
    expect(routeHandlers.length).toBeGreaterThan(0);
  });

  it('treats exactly one module as public, and it is the sign-in form', () => {
    const publicModules = adminSources
      .filter((path) => !isProtected(path))
      .filter((path) => USE_SERVER.test(readFileSync(path, 'utf8')))
      .map(relative);

    expect(publicModules).toEqual(['/app/admin/(auth)/entrar/actions.ts']);
  });

  it.each([
    ['Server Action modules', () => serverActionModules],
    ['Route Handlers', () => routeHandlers],
  ])('%s all call assertAdmin()', (_label, select) => {
    const offenders = select()
      .filter((path) => !readFileSync(path, 'utf8').includes('assertAdmin('))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  /**
   * Every exported action must reach the gate. They do it through one `guarded()` wrapper rather
   * than by repeating the call, so what is asserted is that each one is inside it — an action that
   * forgets the wrapper is an action with no authorization check.
   */
  it('every exported Server Action body goes through guarded()', () => {
    for (const path of serverActionModules) {
      const source = readFileSync(path, 'utf8');
      const exported = source.match(/export async function (\w+)/g) ?? [];
      const guards = source.match(/return guarded\(/g) ?? [];

      expect(guards.length, `${relative(path)}: one guarded() per exported action`).toBe(
        exported.length,
      );
    }
  });
});

describe('the admin Data Access Layer never writes a table directly', () => {
  /**
   * `authenticated` holds `SELECT` and nothing else on every application table, so a write here
   * would 42501 rather than corrupt anything — but it would also mean somebody tried, and the
   * correct answer is an RPC. `.select()` is not a write and is deliberately not matched.
   */
  it('uses no PostgREST mutation verb', () => {
    const offenders = filesUnder(ADMIN_DAL)
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .map((line, index) => ({ line: line.trim(), number: index + 1, path }))
          .filter(({ line }) => /\.(insert|update|upsert|delete)\(/.test(line))
          .filter(({ line }) => !line.startsWith('*') && !line.startsWith('//')),
      )
      .map(({ path, number, line }) => `${relative(path)}:${number} — ${line}`);

    expect(offenders).toEqual([]);
  });

  it('reaches the database through the documented RPCs', () => {
    const source = readFileSync(join(ADMIN_DAL, 'mutations.ts'), 'utf8');

    // Every mutation names its routine, so the whole set of writes is readable in one place.
    for (const routine of [
      'update_event_settings',
      'promote_from_waitlist',
      'promote_registration',
      'cancel_registration',
      'edit_registration',
      'delete_registration',
      'purge_event_registrations',
      'record_export_action',
    ]) {
      expect(source, `mutations.ts must call ${routine}`).toContain(`'${routine}'`);
    }
  });
});
