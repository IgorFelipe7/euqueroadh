'use client';

/**
 * The registration form — PRODUCT-SPEC.md sections 4.2, 4.3, 6 and 7.
 *
 * The smallest client island the flow can be built from. It owns four things the browser has to do
 * and the server cannot: the phone mask, blur-and-correct validation, the pending state, and moving
 * focus to whatever just appeared. Everything it decides is a courtesy — the Server Action re-parses
 * every value from scratch and ignores anything computed here.
 *
 * **Phase 4 is structure, not art direction.** The markup and the semantics are final; the visual
 * treatment in VISUAL-DIRECTION.md section 9 arrives in Phase 5 and must be able to land without
 * touching a line of the logic below.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { registerAction } from '@/app/actions/register';
import { outcomeCopy, type RegistrationOutcome } from '@/lib/domain/outcomes';
import { applyPhoneMask } from '@/lib/domain/phone';
import { validateRegistrationField } from '@/lib/domain/schemas';
import {
  FIELD_COPY,
  FORM_COPY,
  INITIAL_REGISTRATION_STATE,
  REGISTRATION_FIELDS,
  STILL_WAITING_AFTER_MS,
  type RegistrationField,
  type RegistrationFormState,
} from '@/lib/registration/state';

import { TurnstileWidget } from './turnstile-widget';

type FieldErrors = Partial<Record<RegistrationField, string>>;

/** Per-field input semantics, PRODUCT-SPEC.md section 4.2, verbatim. */
const FIELD_ATTRIBUTES: Readonly<
  Record<
    RegistrationField,
    {
      readonly inputMode?: 'numeric' | 'tel';
      readonly pattern?: string;
      readonly autoComplete: string;
      readonly autoCapitalize: 'words' | 'none';
      readonly enterKeyHint: 'next' | 'done';
      readonly maxLength: number;
      readonly type: 'text' | 'tel';
    }
  >
> = {
  name: {
    autoComplete: 'name',
    autoCapitalize: 'words',
    enterKeyHint: 'next',
    maxLength: 120,
    type: 'text',
  },
  // `type="text" inputmode="numeric"`, never `type="number"`: the number input adds spinners,
  // accepts `e`, `+` and `-`, and mutates on an accidental scroll.
  age: {
    inputMode: 'numeric',
    pattern: '[0-9]*',
    autoComplete: 'off',
    autoCapitalize: 'none',
    enterKeyHint: 'next',
    maxLength: 3,
    type: 'text',
  },
  phone: {
    inputMode: 'tel',
    autoComplete: 'tel-national',
    autoCapitalize: 'none',
    enterKeyHint: 'done',
    maxLength: 15,
    type: 'tel',
  },
};

const DIGITS_ONLY = /\D/g;

/** The mask is a typing aid; `(00) 00000-0000` satisfies it and is rejected by the schema. */
function maskValue(field: RegistrationField, raw: string): string {
  if (field === 'phone') return applyPhoneMask(raw);
  if (field === 'age') return raw.replace(DIGITS_ONLY, '').slice(0, 3);
  return raw;
}

/**
 * `accepting` is the advisory state, and this component owns the decision rather than the page.
 *
 * That is not a stylistic choice. A registration that takes the last seat calls `revalidatePath`,
 * and Next re-renders the route in the same response — so if the page decided, the island would be
 * unmounted the instant the state flipped and the person who just got the last seat would watch
 * their confirmation be replaced by "as vagas se esgotaram". Deciding here means the outcome panel
 * outlives the flip, which is the only correct behaviour: their registration really did succeed.
 *
 * The widget, and therefore Cloudflare's script, is only mounted on the branch that can submit.
 */
export function RegistrationForm({
  siteKey,
  accepting,
  unavailableMessage,
}: {
  siteKey: string;
  accepting: boolean;
  unavailableMessage: string | null;
}) {
  const [state, formAction, isPending] = useActionState<RegistrationFormState, FormData>(
    registerAction,
    INITIAL_REGISTRATION_STATE,
  );

  const [values, setValues] = useState(INITIAL_REGISTRATION_STATE.values);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; correlationId: string | null } | null>(
    null,
  );
  /**
   * The error summary belongs to a failed *submit* (VISUAL-DIRECTION.md section 9.4). Blur
   * validation shows the message under the field it belongs to and nothing more: summarising a
   * single field the person is still working through would be noise, and it would announce an
   * error they have not finished making.
   */
  const [summaryShown, setSummaryShown] = useState(false);
  /** Bumped whenever something the person must read has just appeared above the fieldset. */
  const [alertTick, setAlertTick] = useState(0);
  const [waitedLong, setWaitedLong] = useState(false);

  const fieldsetId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fieldId = (field: RegistrationField) => `${fieldsetId}-${field}`;
  const hintId = (field: RegistrationField) => `${fieldsetId}-${field}-hint`;
  const errorId = (field: RegistrationField) => `${fieldsetId}-${field}-error`;

  /* Absorbing a result from the server. ------------------------------------------------------- */

  /*
   * React's own "a value from outside changed, derive from it" pattern: state is adjusted during
   * render, reading nothing impure to do it. An effect would commit one frame showing the previous
   * result — the old error still on screen under the new one — before correcting itself, and the
   * lint rule that forbids it is right to.
   */
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);

    // A terminal outcome replaces the fieldset entirely; the panel takes focus below.
    if (!state.outcome) {
      setValues(state.values);
      setErrors(state.fieldErrors);
      setFormError(
        state.formError ? { message: state.formError, correlationId: state.correlationId } : null,
      );

      if (Object.keys(state.fieldErrors).length > 0 || state.formError !== null) {
        setSummaryShown(true);
        setAlertTick((tick) => tick + 1);
      }
    }
  }

  useEffect(() => {
    if (alertTick === 0) return;
    alertRef.current?.focus();
    // `center`, so a mobile keyboard cannot leave the message behind it (SC 2.4.11).
    alertRef.current?.scrollIntoView({ block: 'center' });
  }, [alertTick]);

  useEffect(() => {
    if (state.outcome) panelRef.current?.focus();
  }, [state.outcome]);

  /*
   * Reassurance, never a timeout. Aborting a request whose write may already have committed is how
   * duplicates are created; the pending state simply persists and says so (section 7.2).
   */
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

  /* Editing. ----------------------------------------------------------------------------------- */

  function handleChange(field: RegistrationField, raw: string) {
    const value = maskValue(field, raw);
    setValues((current) => ({ ...current, [field]: value }));

    // Only once a field has already shown an error: validating every keystroke produces
    // "Informe seu nome completo." for `Joã` while the person is still typing João.
    if (errors[field]) {
      const message = validateRegistrationField(field, value);
      setErrors((current) => ({ ...current, [field]: message ?? undefined }));
    }
  }

  function handleBlur(field: RegistrationField) {
    // An untouched empty field is not an error yet — the person may simply not have reached it.
    if (values[field].length === 0 && !errors[field]) return;

    const message = validateRegistrationField(field, values[field]);
    setErrors((current) => ({ ...current, [field]: message ?? undefined }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const found: FieldErrors = {};

    for (const field of REGISTRATION_FIELDS) {
      const message = validateRegistrationField(field, values[field]);
      if (message) found[field] = message;
    }

    if (Object.keys(found).length === 0) {
      // A submission is going out; whatever the last one said no longer applies.
      setSummaryShown(false);
      setFormError(null);
      return;
    }

    // Blocked here purely to save a round trip; the same parse runs on the server either way.
    event.preventDefault();
    setErrors(found);
    setFormError(null);
    setSummaryShown(true);
    setAlertTick((tick) => tick + 1);
  }

  const listedErrors = summaryShown ? REGISTRATION_FIELDS.filter((field) => errors[field]) : [];

  // An outcome always wins. Once someone has an answer, nothing the event does afterwards may take
  // it off their screen.
  if (state.outcome) {
    return <OutcomePanel ref={panelRef} outcome={state.outcome} />;
  }

  if (!accepting) {
    // Full with no waiting list, or closed. The form is replaced by the reason rather than left in
    // place to accept a submission that cannot succeed.
    return (
      <p role="status" className="text-body rounded-xl border border-border-strong px-5 py-6">
        {unavailableMessage}
      </p>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/*
        `tabindex=-1` plus focus, so the person is put where the problem is described rather than
        left to discover it. Rendered as an empty, unfocusable region when there is nothing to say.
      */}
      <div
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        data-testid="registration-alert"
        className="empty:hidden focus-visible:outline-2 focus-visible:outline-sky-300"
      >
        {listedErrors.length > 0 ? (
          <div className="rounded-lg border border-danger-300 px-4 py-3">
            <h3 className="text-h3 text-text-primary">{FORM_COPY.errorSummaryHeading}</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {listedErrors.map((field) => (
                <li key={field}>
                  <a
                    href={`#${fieldId(field)}`}
                    className="text-hint text-danger-300 underline"
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(fieldId(field))?.focus();
                    }}
                  >
                    {FIELD_COPY[field].label}: {errors[field]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {formError ? (
          <div className="rounded-lg border border-danger-300 px-4 py-3">
            <p className="text-body text-text-primary">{formError.message}</p>
            {formError.correlationId ? (
              <p className="text-hint mt-1 text-text-muted">Código: {formError.correlationId}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="sr-only">{FORM_COPY.legend}</legend>

        {REGISTRATION_FIELDS.map((field) => {
          const attributes = FIELD_ATTRIBUTES[field];
          const { label, hint } = FIELD_COPY[field];
          const message = errors[field];
          const describedBy = [hint ? hintId(field) : null, message ? errorId(field) : null]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={field} className="flex flex-col gap-2">
              <label className="text-label text-text-primary" htmlFor={fieldId(field)}>
                {label}
              </label>
              <input
                id={fieldId(field)}
                name={field}
                value={values[field]}
                onChange={(event) => handleChange(field, event.target.value)}
                onBlur={() => handleBlur(field)}
                type={attributes.type}
                inputMode={attributes.inputMode}
                pattern={attributes.pattern}
                autoComplete={attributes.autoComplete}
                autoCapitalize={attributes.autoCapitalize}
                enterKeyHint={attributes.enterKeyHint}
                maxLength={attributes.maxLength}
                spellCheck={false}
                required
                aria-invalid={message ? true : undefined}
                aria-describedby={describedBy || undefined}
                // `text-input` is 1rem: below 16px, iOS Safari zooms the viewport on focus.
                className="text-input min-h-13 rounded-xl border border-border-strong bg-ink-700 px-4 text-text-primary focus-visible:border-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              />
              {hint ? (
                <p id={hintId(field)} className="text-hint text-text-muted">
                  {hint}
                </p>
              ) : null}
              {message ? (
                // The error is never carried by colour alone: it is text, it is associated with the
                // input through aria-describedby, and the input is aria-invalid.
                <p id={errorId(field)} className="text-hint text-danger-300">
                  {message}
                </p>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-2">
        <p id={`${fieldsetId}-challenge`} className="text-hint text-text-muted">
          {FORM_COPY.challengeLabel}
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
          // mid-interaction. `aria-disabled` announces the state and the handler below enforces it.
          aria-disabled={isPending}
          aria-busy={isPending}
          onClick={(event) => {
            if (isPending) event.preventDefault();
          }}
          className="text-label min-h-14 rounded-xl bg-gold-400 px-6 text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 aria-disabled:opacity-70"
        >
          {isPending ? FORM_COPY.submitting : FORM_COPY.submit}
        </button>

        <p aria-live="polite" className="text-hint empty:hidden text-text-muted">
          {isPending && waitedLong ? FORM_COPY.stillWaiting : ''}
        </p>

        <p className="text-hint text-text-muted">{FORM_COPY.privacy}</p>
      </div>
    </form>
  );
}

/**
 * The terminal panel. It replaces the fieldset in place, is announced politely, and receives focus
 * so a screen-reader user is taken to the answer rather than told one exists somewhere.
 */
function OutcomePanel({
  ref,
  outcome,
}: {
  ref: React.Ref<HTMLDivElement>;
  outcome: RegistrationOutcome;
}) {
  const copy = outcomeCopy(outcome);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      data-outcome={outcome.kind}
      className="flex flex-col gap-3 rounded-xl border border-border-strong px-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
    >
      <h3 className="text-h2 text-text-primary">{copy.heading}</h3>
      {copy.body.map((paragraph) => (
        <p key={paragraph} className="text-body">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
