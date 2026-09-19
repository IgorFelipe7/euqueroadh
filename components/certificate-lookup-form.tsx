'use client';

/**
 * The certificate portal's form — two fields, and a third only when two were not enough.
 *
 * ## What it never does
 *
 * **It never receives a certificate token.** A successful lookup does not return to this component at
 * all: the Server Action redirects, the browser follows, and the capability exists only in a `Location`
 * header and the address bar it produces. There is no prop, no state field and no callback here that a
 * token could arrive through.
 *
 * **It never learns why a lookup failed.** `state.notFound` is one boolean covering a wrong number, a
 * wrong name, a person who did not attend, a cancelled registration, an unbroken ambiguity and a
 * switch that is off. The sentence beside the form is the same in all six cases.
 *
 * ## Why it is a client island
 *
 * The phone mask, the pending state, and moving focus to the field that has just been asked for.
 * Everything it validates is a courtesy; the Server Action re-parses every value.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { findCertificateAction } from '@/app/actions/certificate';
import {
  CERTIFICATE_COPY,
  INITIAL_CERTIFICATE_STATE,
  STILL_WAITING_AFTER_MS,
  type CertificateField,
  type CertificateFormState,
} from '@/lib/certificate/state';
import { applyPhoneMask } from '@/lib/domain/phone';

import { CTA_PRIMARY } from './site/cta';
import { AlertIcon, SpinnerIcon } from './site/icons';
import { TurnstileWidget } from './turnstile-widget';

const FIELD_ATTRIBUTES: Readonly<
  Record<
    CertificateField,
    {
      readonly type: 'tel' | 'text';
      readonly inputMode?: 'tel' | 'numeric';
      readonly autoComplete: string;
      readonly autoCapitalize: 'words' | 'none';
      readonly maxLength: number;
    }
  >
> = {
  phone: {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel-national',
    autoCapitalize: 'none',
    maxLength: 15,
  },
  firstName: {
    type: 'text',
    autoComplete: 'given-name',
    autoCapitalize: 'words',
    maxLength: 60,
  },
  age: {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'off',
    autoCapitalize: 'none',
    maxLength: 3,
  },
};

const FIELD_CLASS = [
  'text-input u-settle min-h-13 w-full rounded-field border bg-ink-700 px-4 text-text-primary',
  'hover:border-border-hover',
  'focus-visible:border-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300',
  'autofill:[-webkit-text-fill-color:var(--color-text-primary)]',
  'autofill:[box-shadow:inset_0_0_0_1000px_var(--color-ink-700)]',
].join(' ');

const DIGITS_ONLY = /\D/g;

function maskValue(field: CertificateField, raw: string): string {
  if (field === 'phone') return applyPhoneMask(raw);
  if (field === 'age') return raw.replace(DIGITS_ONLY, '').slice(0, 3);
  return raw;
}

export function CertificateLookupForm({ siteKey }: { siteKey: string }) {
  const [state, formAction, isPending] = useActionState<CertificateFormState, FormData>(
    findCertificateAction,
    INITIAL_CERTIFICATE_STATE,
  );

  const [values, setValues] = useState(INITIAL_CERTIFICATE_STATE.values);
  const [seenState, setSeenState] = useState(state);
  const [waitedLong, setWaitedLong] = useState(false);
  const [answerTick, setAnswerTick] = useState(0);

  if (state !== seenState) {
    setSeenState(state);
    setValues(state.values);
    setAnswerTick((tick) => tick + 1);
  }

  const fieldsetId = useId();
  const noticeRef = useRef<HTMLDivElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (answerTick === 0) return;

    // The age step is a question, so focus goes to the field. Anything else is a message, so focus
    // goes to the message — a screen-reader user is taken to the answer rather than left to find it.
    if (state.step === 'age') {
      ageRef.current?.focus();
    } else if (state.notFound || state.formError) {
      noticeRef.current?.focus();
      noticeRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [answerTick, state.step, state.notFound, state.formError]);

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

  const stepCopy = CERTIFICATE_COPY.steps[state.step];
  const onAgeStep = state.step === 'age';

  function field(name: CertificateField, ref?: React.Ref<HTMLInputElement>) {
    const attributes = FIELD_ATTRIBUTES[name];
    const { label, hint } = CERTIFICATE_COPY.fields[name];
    const message = state.fieldErrors[name];

    const inputId = `${fieldsetId}-${name}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-2">
        <label className="text-label text-text-primary" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          name={name}
          value={values[name]}
          onChange={(event) =>
            setValues((current) => ({ ...current, [name]: maskValue(name, event.target.value) }))
          }
          type={attributes.type}
          inputMode={attributes.inputMode}
          autoComplete={attributes.autoComplete}
          autoCapitalize={attributes.autoCapitalize}
          enterKeyHint={name === 'age' || onAgeStep ? 'done' : 'next'}
          maxLength={attributes.maxLength}
          spellCheck={false}
          required
          aria-invalid={message ? true : undefined}
          aria-describedby={
            [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(' ') || undefined
          }
          className={`${FIELD_CLASS} ${message ? 'border-danger-300' : 'border-border-strong'}`}
        />
        {hint ? (
          <p id={hintId} className="text-hint text-text-muted">
            {hint}
          </p>
        ) : null}
        {message ? (
          <p id={errorId} className="text-hint flex items-start gap-1.5 text-danger-300">
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-ink-600 bg-ink-800 p-6 sm:p-8">
      <form action={formAction} noValidate className="flex flex-col gap-6">
        <div
          ref={noticeRef}
          tabIndex={-1}
          role="alert"
          data-testid="certificate-alert"
          className="flex flex-col gap-4 empty:hidden"
        >
          {state.notFound ? (
            <div
              data-testid="certificate-not-found"
              className="flex items-start gap-3 rounded-field border border-border-strong bg-ink-900 px-4 py-4"
            >
              <AlertIcon size={18} className="mt-0.5 shrink-0 text-text-muted" />
              <div className="flex flex-col gap-1">
                {CERTIFICATE_COPY.notFound.map((paragraph) => (
                  <p key={paragraph} className="text-body text-text-secondary">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

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

        <fieldset className="flex flex-col gap-5 border-0 p-0">
          <legend className="sr-only">{CERTIFICATE_COPY.legend}</legend>

          {stepCopy.notice ? (
            <p role="status" className="text-body text-sky-300">
              {stepCopy.notice}
            </p>
          ) : null}

          {/*
            On the age step the two identifying fields become hidden inputs rather than disappearing
            from the payload: the lookup is always phone + name + age, and re-rendering them as
            editable would invite a guest to change the name that just produced the ambiguity.
          */}
          {onAgeStep ? (
            <>
              <input type="hidden" name="phone" value={values.phone} />
              <input type="hidden" name="firstName" value={values.firstName} />
              {field('age', ageRef)}
            </>
          ) : (
            <>
              {field('phone')}
              {field('firstName')}
            </>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <p id={`${fieldsetId}-challenge`} className="text-micro-label text-text-muted uppercase">
            {CERTIFICATE_COPY.challengeLabel}
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
            aria-disabled={isPending}
            aria-busy={isPending}
            onClick={(event) => {
              if (isPending) event.preventDefault();
            }}
            className={`${CTA_PRIMARY} w-full sm:w-auto sm:self-start aria-disabled:cursor-wait aria-disabled:opacity-80`}
          >
            {isPending ? <SpinnerIcon /> : null}
            {isPending ? stepCopy.submitting : stepCopy.submit}
          </button>

          <p aria-live="polite" className="text-hint empty:hidden text-text-muted">
            {isPending && waitedLong ? 'Ainda estamos procurando…' : ''}
          </p>

          <p className="text-hint text-text-muted">{CERTIFICATE_COPY.privacy}</p>
        </div>
      </form>
    </div>
  );
}
