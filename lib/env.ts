// The single place in the application that reads `process.env`
// (ARCHITECTURE.md section 5, rule 2; section 9.1).
//
// `server-only` guards the whole module rather than just the `server` object: bundling any part of
// this file into a Client Component would drag the secret schema — and the `process.env` reads
// behind it — across the boundary. Public values reach the browser as props from Server
// Components, never by importing this module.
import 'server-only';

import { z } from 'zod';

/**
 * Values inlined into the client bundle at build time. Nothing secret may live here.
 *
 * Supabase's legacy `anon` / `service_role` JWT keys are deprecated and retire at the end of 2026,
 * so the key formats are asserted: pasting a legacy key is a silent misconfiguration otherwise.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: 'must be an absolute URL' }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith('sb_publishable_', { message: 'must be a `sb_publishable_…` key' }),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1, { message: 'is required' }),
  NEXT_PUBLIC_SITE_URL: z.url({ message: 'must be an absolute URL' }),
});

/** Values that must never leave the server. */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .startsWith('sb_secret_', { message: 'must be a `sb_secret_…` key' }),
  TURNSTILE_SECRET_KEY: z.string().min(1, { message: 'is required' }),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Thrown at module load — and therefore at build time — when the environment is incomplete.
 * The message names the offending variables and never their values, so it is safe in build logs.
 */
export class EnvironmentError extends Error {
  constructor(scope: string, issues: readonly string[]) {
    super(
      `Invalid ${scope} environment. Check .env.example and ARCHITECTURE.md section 9.1.\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
    this.name = 'EnvironmentError';
  }
}

function parse<T extends z.ZodType>(schema: T, scope: string, source: Record<string, unknown>) {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      // A missing variable arrives as `undefined`; Zod reports that as a type error, which reads
      // poorly in a build log.
      const reason = issue.code === 'invalid_type' ? 'is missing' : issue.message;
      return `${name} ${reason}`;
    });

    throw new EnvironmentError(scope, issues);
  }

  return result.data as z.infer<T>;
}

// `process.env.NEXT_PUBLIC_*` must be referenced statically, one property at a time: Next inlines
// these by literal substitution and a dynamic lookup would leave them `undefined` in production.
export const client: ClientEnv = parse(clientSchema, 'public', {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

export const server: ServerEnv = parse(serverSchema, 'server', {
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
});

/*
 * The public demonstration deployment (docs/DEMO.md). Off unless `DEMO_MODE=true`.
 *
 * The demo signs visitors in as one fixed organizer account, so that address is pinned to the
 * RFC 2606 reserved domain `example.com`. No misconfiguration — not even `DEMO_MODE=true` pasted
 * into the production project by mistake — can hand a visitor the session of a real organizer:
 * a reserved address cannot belong to one.
 */
const blankAsMissing = (value: unknown) => (value === '' ? undefined : value);

const demoSchema = z
  .object({
    DEMO_MODE: z.preprocess(
      blankAsMissing,
      z.enum(['true', 'false'], { message: 'must be `true` or `false`' }).optional(),
    ),
    DEMO_ADMIN_EMAIL: z.preprocess(
      blankAsMissing,
      z
        .string()
        .regex(/^[a-z0-9._%+-]+@example\.com$/i, { message: 'must be an @example.com address' })
        .optional(),
    ),
  })
  .refine((value) => value.DEMO_MODE !== 'true' || value.DEMO_ADMIN_EMAIL !== undefined, {
    message: 'is required when DEMO_MODE=true',
    path: ['DEMO_ADMIN_EMAIL'],
  });

export interface DemoEnv {
  /** `true` only on the demonstration deployment. */
  readonly enabled: boolean;
  /** The demo organizer's reserved address; `null` whenever the demo is off. */
  readonly adminEmail: string | null;
}

const demoValues = parse(demoSchema, 'demo', {
  DEMO_MODE: process.env.DEMO_MODE,
  DEMO_ADMIN_EMAIL: process.env.DEMO_ADMIN_EMAIL,
});

export const demo: DemoEnv = {
  enabled: demoValues.DEMO_MODE === 'true',
  adminEmail: demoValues.DEMO_MODE === 'true' ? (demoValues.DEMO_ADMIN_EMAIL ?? null) : null,
};
