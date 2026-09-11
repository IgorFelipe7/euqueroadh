/**
 * A structural guard, not a behavioural test.
 *
 * A `'use server'` module may export only async functions. Next does not enforce it — it compiles
 * every other export into a **server reference**, so a constant exported from an actions file
 * arrives in the browser as a callable stub rather than as its value. That is not a type error, not
 * a build error and not visible in any unit test of the module itself; the sign-in screen shipped
 * its second step to visitors who had not requested a code because of exactly this, and only an
 * end-to-end run against the built application noticed.
 *
 * Hence a cheap check that runs with `npm test`: every top-level export of a `'use server'` module
 * must be an async function, or a type that is erased before it can become anything at all.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_DIRECTORY = resolve(process.cwd(), 'app');

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const serverModules = sourceFilesUnder(APP_DIRECTORY).filter((path) =>
  /^\s*(['"])use server\1\s*;/m.test(readFileSync(path, 'utf8')),
);

/** `export type`, `export interface` and `export async function` — nothing else survives. */
const PERMITTED = /^export\s+(type\b|interface\b|async\s+function\b|default\s+async\s+function\b)/;

describe("every 'use server' module", () => {
  it('is found at all, so this test cannot pass by scanning nothing', () => {
    expect(serverModules.length).toBeGreaterThan(0);
  });

  it('exports only async functions and erased types', () => {
    const offenders = serverModules.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter(({ line }) => line.startsWith('export') && !PERMITTED.test(line))
        .map(({ line, number }) => `${path}:${number} — ${line}`),
    );

    expect(offenders).toEqual([]);
  });
});
