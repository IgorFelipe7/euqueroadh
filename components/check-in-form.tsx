'use client';

/**
 * The guest's self check-in — one field at a time, and never more fields than the database actually
 * needs to identify them.
 *
 * ## The interaction, and the one rule behind it
 *
 * The form shows exactly one input. The guest types the telephone number they registered with and
 * taps once. If that number identifies one confirmed registration, they are done — four seconds,
 * standing in a doorway, on a venue network. If it does not, the **server** says what else it needs,
 * and the form grows by one field.
 *
 * **The browser never decides that a second field is required, and never learns why one was.**
 * `state.step` arrives from the Server Action, which got it from the RPC. A number nobody registered
 * and a number shared by five people produce the same prompt, in the same order, with the same words
 * (migration 18). There is nothing in this component's props, state or markup from which the number
 * of registrations behind a telephone number could be recovered.
 *
 * ## Why it is a client island at all
 *
 * Four things the browser has to do and the server cannot: the phone mask, the pending state, moving
 * focus to whatever just appeared, and the household loop — returning to the name step without a page
 * load so the second person on one telephone is one tap away, not one reload.
 *
 * Everything it decides is a courtesy. The Server Action re-parses every value and the RPC re-resolves
 * the session; nothing computed here is trusted anywhere.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { checkInAction } from '@/app/actions/check-in';
import {
  CHECK_IN_COPY,
  INITIAL_CHECK_IN_STATE,
  SESSION_FIELD_NAME,
  STILL_WAITING_AFTER_MS,
  type CheckInFormState,
  type CheckInStep,
} from '@/lib/check-in/state';
import { applyPhoneMask } from '@/lib/domain/phone';

import { CTA_PRIMARY, CTA_SECONDARY, CTA_SECONDARY_WRAP } from './site/cta';
import { AlertIcon, SpinnerIcon } from './site/icons';
import { TurnstileWidget } from './turnstile-widget';

/**
 * Field semantics per step.
 *
 * `type="tel" inputmode="tel" autocomplete="tel-national"` on the first one is the difference between
 * a guest tapping a numeric keypad and a guest hunting for digits on a QWERTY layout — which, at a
 * door, is the difference between four seconds and twenty. The age field is `type="text"` with a
 * numeric inputmode, never `type="number"`: the number input adds spinners, accepts `e`, `+` and `-`,
 * and mutates on an accidental scroll.
 */
const FIELD_ATTRIBUTES: Readonly<
  Record<
    CheckInStep,
    {
      readonly name: 'phone' | 'firstName' | 'age';
      readonly type: 'tel' | 'text';
      readonly inputMode?: 'tel' | 'numeric';
      readonly autoComplete: string;
      readonly autoCapitalize: 'words' | 'none';
      readonly maxLength: number;
    }
  >
> = {
  phone: {
    name: 'phone',
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel-national',
    autoCapitalize: 'none',
    maxLength: 15,
  },
  firstName: {
    name: 'firstName',
    type: 'text',
    autoComplete: 'given-name',
    autoCapitalize: 'words',
    maxLength: 60,
  },
  age: {
    name: 'age',
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCapitalize: 'none',
    maxLength: 3,
  },
};

const FIELD_CLASS = [
  // `min-h-14` rather than the registration form's 13: this control is used one-handed, standing,
  // sometimes in a moving queue, and it is the only control on the screen.
  'text-input u-settle min-h-14 w-full rounded-field border bg-ink-700 px-4 text-text-primary',
  'hover:border-border-hover',
  'focus-visible:border-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300',
  'autofill:[-webkit-text-fill-color:var(--color-text-primary)]',
  'autofill:[box-shadow:inset_0_0_0_1000px_var(--color-ink-700)]',
].join(' ');

const DIGITS_ONLY = /\D/g;

function maskValue(step: CheckInStep, raw: string): string {
  if (step === 'phone') return applyPhoneMask(raw);
  if (step === 'age') return raw.replace(DIGITS_ONLY, '').slice(0, 3);
  return raw;
}

export function CheckInForm({
  sessionToken,
  siteKey,
  certificatePortal,
}: {
  sessionToken: string;
  siteKey: string;
  /** `euqueroadh.com/certificado`, built server-side so the two surfaces cannot name different URLs. */
  certificatePortal: string;
}) {
  const [state, formAction, isPending] = useActionState<CheckInFormState, FormData>(
    checkInAction,
    INITIAL_CHECK_IN_STATE,
  );

  /**
   * The view the guest is looking at.
   *
   * Held locally rather than read straight off `state`, for one reason: the household loop has to be
   * able to dismiss an outcome the server has already returned and go back to the name step, without
   * a round trip. Every server answer replaces it during render — the React-sanctioned "derive from
   * props that changed" pattern, not an effect, which would commit one frame showing the previous
   * screen before correcting itself.
   */
  const [view, setView] = useState<{ step: CheckInStep; outcome: CheckInFormState['outcome'] }>({
    step: INITIAL_CHECK_IN_STATE.step,
    outcome: null,
  });
  const [values, setValues] = useState(INITIAL_CHECK_IN_STATE.values);
  const [seenState, setSeenState] = useState(state);
  const [waitedLong, setWaitedLong] = useState(false);
  /** Bumped whenever something the person must read or act on has just replaced what was there. */
  const [focusTick, setFocusTick] = useState(0);

  if (state !== seenState) {
    setSeenState(state);
    setView({ step: state.step, outcome: state.outcome });
    setValues(state.values);
    setFocusTick((tick) => tick + 1);
  }

  const fieldsetId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusTick === 0) return;

    // Focus follows the thing that just appeared: the outcome panel when the flow ended, otherwise
    // the field that is now being asked for — so a screen-reader user is taken to the answer or to
    // the next question rather than told that one exists somewhere.
    if (view.outcome) {
      panelRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [focusTick, view.outcome]);

  const [seenPending, setSeenPending] = useState(isPending);
  if (isPending !== seenPending) {
    setSeenPending(isPending);
    setWaitedLong(false);
  }

  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setWaitedLong(true), STILL_WAITING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  /**
   * The household loop.
   *
   * Returns to the **name** step rather than to the phone step, keeping the number: the person
   * holding the telephone has just checked one member of their group in, and the next one is
   * identified by a name, not by retyping a number that is already correct. It is a purely local
   * transition — no request, no reveal, and the other people's names are never on this device.
   */
  function confirmAnother() {
    setView({ step: 'firstName', outcome: null });
    setValues((current) => ({ phone: current.phone, firstName: '', age: '' }));
    setFocusTick((tick) => tick + 1);
  }

  /** The generic refusal's only action: start over, with nothing carried forward. */
  function startOver() {
    setView({ step: 'phone', outcome: null });
    setValues({ phone: '', firstName: '', age: '' });
    setFocusTick((tick) => tick + 1);
  }

  if (view.outcome) {
    return (
      <OutcomePanel
        ref={panelRef}
        outcome={view.outcome}
        certificatePortal={certificatePortal}
        onAnother={confirmAnother}
        onRetry={startOver}
      />
    );
  }

  const step = view.step;
  const copy = CHECK_IN_COPY.steps[step];
  const attributes = FIELD_ATTRIBUTES[step];
  const message = state.fieldErrors[attributes.name];

  const inputId = `${fieldsetId}-${attributes.name}`;
  const hintId = `${fieldsetId}-hint`;
  const errorId = `${fieldsetId}-error`;

  return (
    <div className="rounded-panel border border-ink-600 bg-ink-800 p-6 sm:p-8">
      <form action={formAction} noValidate className="flex flex-col gap-6">
        {/*
          The session token travels back in a hidden field. It is a capability the guest already holds
          — it is in the address bar they are looking at — so putting it in the DOM discloses nothing
          new, and the RPC re-resolves it under the event lock regardless of what arrives here.
        */}
        <input type="hidden" name={SESSION_FIELD_NAME} value={sessionToken} />

        {/*
          The values from the steps already answered. Rendered as hidden inputs rather than held only
          in React state so that the whole identification survives a resubmission after a refused
          Turnstile challenge, which is the one case where a guest submits the same step twice.
        */}
        {attributes.name !== 'phone' ? (
          <input type="hidden" name="phone" value={values.phone} />
        ) : null}
        {attributes.name === 'age' ? (
          <input type="hidden" name="firstName" value={values.firstName} />
        ) : null}

        <div
          role="alert"
          data-testid="check-in-alert"
          className="flex flex-col gap-4 empty:hidden"
        >
          {state.formError ? (
            <div className="flex items-start gap-3 rounded-field border border-danger-300 bg-ink-900 px-4 py-4">
              <AlertIcon size={18} className="mt-0.5 shrink-0 text-danger-300" />
              <div>
                <p className="text-body text-text-primary">{state.formError}</p>
                {state.correlationId ? (
                  <p className="text-hint mt-1 text-text-muted">Código: {state.correlationId}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-4 border-0 p-0">
          <legend className="sr-only">{CHECK_IN_COPY.legend}</legend>

          {/*
            The step's prompt. `status`, not `alert`: it is the next question, not an interruption,
            and the focus move below is what actually takes a screen-reader user to it.
          */}
          {copy.notice ? (
            <p role="status" className="text-body text-sky-300">
              {copy.notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <label className="text-label text-text-primary" htmlFor={inputId}>
              {copy.label}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              name={attributes.name}
              value={values[attributes.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [attributes.name]: maskValue(step, event.target.value),
                }))
              }
              type={attributes.type}
              inputMode={attributes.inputMode}
              autoComplete={attributes.autoComplete}
              autoCapitalize={attributes.autoCapitalize}
              enterKeyHint="done"
              maxLength={attributes.maxLength}
              spellCheck={false}
              required
              aria-invalid={message ? true : undefined}
              aria-describedby={
                [copy.hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ') ||
                undefined
              }
              className={`${FIELD_CLASS} ${message ? 'border-danger-300' : 'border-border-strong'}`}
            />
            {copy.hint ? (
              <p id={hintId} className="text-hint text-text-muted">
                {copy.hint}
              </p>
            ) : null}
            {message ? (
              <p id={errorId} className="text-hint flex items-start gap-1.5 text-danger-300">
                <AlertIcon size={16} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <p id={`${fieldsetId}-challenge`} className="text-micro-label text-text-muted uppercase">
            {CHECK_IN_COPY.challengeLabel}
          </p>
          <TurnstileWidget
            siteKey={siteKey}
            challengeNonce={state.challengeNonce}
            describedBy={`${fieldsetId}-challenge`}
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="submit"
            // Not `disabled`: a disabled button leaves the tab order and drops its accessible name
            // mid-interaction. `aria-disabled` announces the state and the handler enforces it.
            aria-disabled={isPending}
            aria-busy={isPending}
            onClick={(event) => {
              if (isPending) event.preventDefault();
            }}
            className={`${CTA_PRIMARY} w-full aria-disabled:cursor-wait aria-disabled:opacity-80`}
          >
            {isPending ? <SpinnerIcon /> : null}
            {isPending ? copy.submitting : copy.submit}
          </button>

          {/*
            Reassurance, never a timeout. Aborting a request whose write may already have committed
            is how a guest ends up tapping again; the pending state simply persists and says so.
          */}
          <p aria-live="polite" className="text-hint empty:hidden text-text-muted">
            {isPending && waitedLong ? 'Ainda estamos confirmando…' : ''}
          </p>

          <p className="text-hint text-text-muted">{CHECK_IN_COPY.privacy}</p>
        </div>
      </form>
    </div>
  );
}

/**
 * The terminal panel.
 *
 * Same container, same width as the form, so nothing moves when it replaces it. Announced politely
 * and focused, so the answer is where the person already is.
 *
 * **No outcome echoes personal data.** Not the name that was matched, not the age, not the telephone
 * number, not how many people share it — the success screen says "you", and the refusal says "our
 * team", and neither says anything a screenshot could disclose about somebody else.
 */
function OutcomePanel({
  ref,
  outcome,
  certificatePortal,
  onAnother,
  onRetry,
}: {
  ref: React.Ref<HTMLDivElement>;
  outcome: NonNullable<CheckInFormState['outcome']>;
  certificatePortal: string;
  onAnother: () => void;
  onRetry: () => void;
}) {
  const copy = CHECK_IN_COPY.outcomes[outcome];
  const succeeded = outcome === 'confirmed' || outcome === 'already_present';

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      data-outcome={outcome}
      className={`u-outcome rounded-panel border bg-ink-800 p-6 sm:p-8 ${
        succeeded ? 'border-success-300' : 'border-border-strong'
      }`}
    >
      <div className="flex flex-col gap-4">
        {copy.eyebrow ? (
          <div className="flex items-center gap-3">
            {/*
              The check mark resolves once and stops. `u-draw` is the page's existing stroke
              primitive (VISUAL-DIRECTION.md § 10.2), which already collapses to a static final state
              under `prefers-reduced-motion` — so the celebration is one shared rule, not a second
              implementation of restraint.
            */}
            <svg
              viewBox="0 0 24 24"
              className="size-7 shrink-0"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                className="u-draw"
                d="M4 12.5 L10 18 L20 6"
                stroke="var(--color-success-300)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-micro-label text-success-300 uppercase">{copy.eyebrow}</p>
          </div>
        ) : null}

        <h2 className="text-h2 font-stretch-[105%] text-balance text-text-primary">{copy.heading}</h2>

        {copy.body.map((paragraph) => (
          <p key={paragraph} className="text-body max-w-[46ch] text-text-secondary">
            {paragraph}
          </p>
        ))}

        {succeeded ? (
          <>
            {/*
              The certificate hand-off. An ADDRESS, never a link carrying a token: the certificate
              capability is personal, it does not exist as a shareable thing yet, and the organizer's
              whole distribution plan is one public URL people can be told once.
            */}
            <div className="mt-2 flex flex-col gap-1 border-t border-ink-600 pt-5">
              <p className="text-micro-label text-text-muted uppercase">
                {CHECK_IN_COPY.certificate.heading}
              </p>
              <p className="text-hint text-text-secondary">{CHECK_IN_COPY.certificate.body}</p>
              <p className="text-label text-sky-300">{certificatePortal}</p>
            </div>

            {/*
              The wrapping variant, deliberately: six words do not fit on one line inside this panel on
              a 375px phone, and `CTA_SECONDARY` would run the text through the pill's rounded ends.
              See `cta.ts` for why this is a separate constant rather than an appended utility.
            */}
            <button type="button" onClick={onAnother} className={`${CTA_SECONDARY_WRAP} mt-2 w-full`}>
              {CHECK_IN_COPY.another}
            </button>
          </>
        ) : null}

        {outcome === 'manual' ? (
          <button type="button" onClick={onRetry} className={`${CTA_SECONDARY} mt-2 w-full`}>
            {CHECK_IN_COPY.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}
