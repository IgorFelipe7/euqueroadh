'use client';

/**
 * The two-step sign-in form (ADMIN-SPEC.md section 2).
 *
 * A Client Component for three reasons, all of them real: `useActionState` for the step transition,
 * a live countdown on the resend button, and moving focus to the code field when the second step
 * appears. Nothing else here needs the browser, and no Supabase client is created — the OTP
 * exchange happens in the Server Actions, which is what keeps the session cookies `HttpOnly` and
 * keeps the known/unknown-address distinction on the server.
 *
 * **One code field, not six boxes.** Six boxes break paste, break `autocomplete="one-time-code"`
 * autofill, and present a screen reader with six unlabelled inputs where the user has one code.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import {
  INITIAL_SIGN_IN_STATE,
  OTP_LENGTH,
  OTP_RESEND_INTERVAL_SECONDS,
  SIGN_IN_COPY,
  type SignInState,
} from '@/lib/auth/sign-in';

import { signInAction } from './actions';

export function SignInForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(
    signInAction,
    INITIAL_SIGN_IN_STATE,
  );

  const emailFieldId = useId();
  const codeFieldId = useId();
  const messageId = useId();
  const codeField = useRef<HTMLInputElement>(null);

  // The code field is where the person needs to be the moment the second screen appears.
  useEffect(() => {
    if (state.step === 'verify') codeField.current?.focus();
  }, [state.step]);

  const secondsLeft = useResendCountdown(state.step === 'verify' ? state.sentAt : null);
  const canResend = secondsLeft === 0;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.step === 'request' ? (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-h2">{SIGN_IN_COPY.request.heading}</h1>
            <p className="text-body">{SIGN_IN_COPY.request.intro}</p>
          </header>

          {notice ? <Message id={messageId} tone="notice" text={notice} /> : null}
          {state.error ? <Message id={messageId} tone="error" text={state.error} /> : null}

          <div className="flex flex-col gap-2">
            <label className="text-label" htmlFor={emailFieldId}>
              {SIGN_IN_COPY.request.emailLabel}
            </label>
            <input
              id={emailFieldId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              defaultValue={state.email}
              aria-describedby={state.error ? messageId : undefined}
              aria-invalid={state.error ? true : undefined}
              className="min-h-12 rounded-lg border border-border-strong bg-white px-4 text-input"
            />
          </div>

          <button
            type="submit"
            name="intent"
            value="request"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-12 rounded-md bg-blue-600 px-5 text-label text-white disabled:opacity-70"
          >
            {isPending ? SIGN_IN_COPY.request.submitting : SIGN_IN_COPY.request.submit}
          </button>

          <p className="text-hint">{SIGN_IN_COPY.request.footnote}</p>
        </>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-h2">{SIGN_IN_COPY.verify.heading}</h1>
            <p className="text-body">{SIGN_IN_COPY.verify.intro(state.email)}</p>
          </header>

          {state.notice ? <Message id={`${messageId}-notice`} tone="notice" text={state.notice} /> : null}
          {state.error ? <Message id={messageId} tone="error" text={state.error} /> : null}

          <input type="hidden" name="email" value={state.email} />

          <div className="flex flex-col gap-2">
            <label className="text-label" htmlFor={codeFieldId}>
              {SIGN_IN_COPY.verify.codeLabel}
            </label>
            <input
              ref={codeField}
              id={codeFieldId}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              pattern={`\\d{${OTP_LENGTH}}`}
              required
              aria-describedby={state.error ? `${messageId} ${codeFieldId}-hint` : `${codeFieldId}-hint`}
              aria-invalid={state.error ? true : undefined}
              className="min-h-12 rounded-lg border border-border-strong bg-white px-4 text-input tracking-[0.4em]"
            />
            <p className="text-hint" id={`${codeFieldId}-hint`}>
              {SIGN_IN_COPY.verify.codeHint}
            </p>
          </div>

          <button
            type="submit"
            name="intent"
            value="verify"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-12 rounded-md bg-blue-600 px-5 text-label text-white disabled:opacity-70"
          >
            {isPending ? SIGN_IN_COPY.verify.submitting : SIGN_IN_COPY.verify.submit}
          </button>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              name="intent"
              value="restart"
              formNoValidate
              className="min-h-12 text-label text-blue-600 underline"
            >
              {SIGN_IN_COPY.verify.useAnotherEmail}
            </button>
            <button
              type="submit"
              name="intent"
              value="resend"
              formNoValidate
              disabled={!canResend || isPending}
              className="min-h-12 text-label text-blue-600 underline disabled:no-underline disabled:opacity-70"
            >
              {canResend ? SIGN_IN_COPY.verify.resend : SIGN_IN_COPY.verify.resendIn(secondsLeft)}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function Message({ id, tone, text }: { id: string; tone: 'error' | 'notice'; text: string }) {
  return (
    <p
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-lg border border-danger-300 px-4 py-3 text-hint'
          : 'rounded-lg border border-border-strong px-4 py-3 text-hint'
      }
    >
      {text}
    </p>
  );
}

/**
 * Seconds remaining before another code may be requested. The window is Supabase's own
 * `max_frequency`, so the countdown explains a real limit instead of inventing one; asking early
 * would be refused by the platform and — because every client-side rejection renders as "sent" —
 * would look like success while no e-mail was sent.
 *
 * **The clock is read in an effect, never during render.** `Date.now()` in a render body is impure:
 * the same render produces different output every time React replays it, and on a first render it
 * would differ between the server's HTML and the client's hydration. Here the render path is a pure
 * function of two pieces of state — `elapsed`, which the interval advances, and `seenSentAt`, which
 * resets it — so it is idempotent by construction.
 */
function useResendCountdown(sentAt: number | null): number {
  const [seenSentAt, setSeenSentAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // React's own "a prop changed, derive from it" pattern — adjusting state during render, reading
  // nothing impure to do it. Resetting in the effect instead would commit one frame of the previous
  // countdown first, which is a `Reenviar código` button that is briefly enabled immediately after
  // a code was sent.
  if (sentAt !== seenSentAt) {
    setSeenSentAt(sentAt);
    setElapsed(0);
  }

  useEffect(() => {
    if (sentAt === null) return;

    // The browser's clock, not the server's: `sentAt` is a server timestamp, and any skew between
    // the two would show a countdown that is simply wrong. Starting the measurement here — the
    // first commit after the code was sent — errs by one round trip and never by the skew.
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);
      // Nothing changes once the window has closed; ticking on would re-render for no reason.
      if (seconds >= OTP_RESEND_INTERVAL_SECONDS) clearInterval(timer);
    }, 250);

    return () => clearInterval(timer);
  }, [sentAt]);

  if (sentAt === null) return 0;
  return Math.max(0, OTP_RESEND_INTERVAL_SECONDS - elapsed);
}
