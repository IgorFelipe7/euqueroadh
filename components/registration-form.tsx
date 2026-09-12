'use client';

/**
 * The registration form — PRODUCT-SPEC.md sections 4.2, 4.3, 6 and 7;
 * VISUAL-DIRECTION.md section 9.
 *
 * The smallest client island the flow can be built from. It owns four things the browser has to do
 * and the server cannot: the phone mask, blur-and-correct validation, the pending state, and moving
 * focus to whatever just appeared. Everything it decides is a courtesy — the Server Action re-parses
 * every value from scratch and ignores anything computed here.
 *
 * **Phase 5 changed the presentation and nothing else.** The state machine, the validation timing,
 * the focus choreography, the Turnstile lifetime and the shape of what crosses to the server are
 * exactly as Phase 4 proved them. The visual work is the panel, the field anatomy, the states and
 * the outcome treatments; the only additions to behaviour are the three secondary actions the
 * confirmation panel offers (section 6.1), which touch no part of the submission path.
 */

import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { registerAction } from '@/app/actions/register';
import type { EventLinks } from '@/lib/domain/event-presentation';
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

import { CTA_PRIMARY, CTA_SECONDARY, CTA_TERTIARY } from './site/cta';
import { AlertIcon, CalendarIcon, MapPinIcon, ShareIcon, SpinnerIcon } from './site/icons';
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

/**
 * The field's visual anatomy — section 9.2 and 9.3.
 *
 * The border is the control's boundary, not the fill: `border-strong` is 3.41:1 against the
 * `ink-700` surface and meets SC 1.4.11, while the surface itself is deliberately only 1.17:1
 * against the page. Lightening the fill to "fix" that would be the wrong repair (section 3.6).
 *
 * `:autofill` is overridden explicitly, because a browser otherwise forces a pale fill that would
 * put near-black text on this panel and silently break contrast.
 */
const FIELD_CLASS = [
  'text-input u-settle min-h-13 w-full rounded-field border bg-ink-700 px-4 text-text-primary',
  'hover:border-border-hover',
  'focus-visible:border-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300',
  'autofill:[-webkit-text-fill-color:var(--color-text-primary)]',
  'autofill:[box-shadow:inset_0_0_0_1000px_var(--color-ink-700)]',
].join(' ');

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
  links,
  unavailable,
}: {
  siteKey: string;
  accepting: boolean;
  unavailableMessage: string | null;
  /** Four public strings for the outcome panel's secondary actions. No part of the event row. */
  links: EventLinks;
  /**
   * The composition shown when `accepting` is false, rendered on the server and handed over as a
   * node (`ClosedPanel`). The branch below still belongs to this component — an outcome already on
   * screen outranks any state the page arrives in — but the markup for that state, and the facts in
   * it, never enter the client bundle. `unavailableMessage` remains the fallback.
   */
  unavailable?: React.ReactNode;
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

  /**
   * True between pressing the submit control and that press resolving.
   *
   * It exists because of a defect found by measuring the page rather than by reading it: pressing
   * the button blurs the field above it, blur validation inserts that field's error message, and
   * the button moves down by about 50px **between `pointerdown` and `pointerup`** — so the pointer
   * comes up somewhere else, no `click` is generated, and the form is never submitted. The person
   * taps "Confirmar inscrição", the button appears to do nothing, and no summary is announced.
   *
   * The fix is to let the submit path own that validation: while a press is in flight, blur does
   * not validate, and `handleSubmit` then reports every field at once with the focused error
   * summary — which is exactly what PRODUCT-SPEC.md section 4.3 specifies for submit. Nothing is
   * validated less; it is validated in one place instead of two, and the layout stops moving under
   * the pointer.
   *
   * `pointerdown` rather than `relatedTarget`, because iOS Safari does not focus a button on tap
   * and would leave `relatedTarget` null exactly where this matters most.
   */
  const pressingSubmit = useRef(false);

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

  /*
   * Releasing the pointer ends the press, wherever it is released — a press that began on the
   * button and ended somewhere else must not leave blur validation switched off.
   */
  useEffect(() => {
    const release = () => {
      pressingSubmit.current = false;
    };

    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);

    return () => {
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
    };
  }, []);

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
    // A submission is being pressed: `handleSubmit` validates every field in a moment and reports
    // them together. Inserting one message here would move the button out from under the pointer.
    if (pressingSubmit.current) return;

    // An untouched empty field is not an error yet — the person may simply not have reached it.
    if (values[field].length === 0 && !errors[field]) return;

    const message = validateRegistrationField(field, values[field]);
    setErrors((current) => ({ ...current, [field]: message ?? undefined }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    pressingSubmit.current = false;

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
    return <OutcomePanel ref={panelRef} outcome={state.outcome} links={links} />;
  }

  if (!accepting) {
    // Full with no waiting list, or closed. The form is replaced by the reason rather than left in
    // place to accept a submission that cannot succeed.
    if (unavailable) return <>{unavailable}</>;

    return (
      // The bare fallback, for a caller that passes no composition. The same accent the hero's
      // state banner wears, so the two sentences read as one state rather than as two notices.
      <Panel accent="border-sky-300/40">
        <p role="status" className="text-body text-text-primary">
          {unavailableMessage}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/*
          The error summary (section 9.4). Above the fieldset, never below the button, so a mobile
          keyboard cannot hide it. `tabindex=-1` plus focus, so the person is put where the problem
          is described rather than left to discover it. Rendered as an empty, unfocusable region
          when there is nothing to say.
        */}
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          data-testid="registration-alert"
          className="flex flex-col gap-4 empty:hidden"
        >
          {listedErrors.length > 0 ? (
            // An outlined panel, not a red flood fill: the border carries the signal and the text
            // stays at full contrast.
            <div className="rounded-field border border-danger-300 bg-ink-800 px-4 py-4">
              <h3 className="text-h3 text-text-primary">{FORM_COPY.errorSummaryHeading}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {listedErrors.map((field) => (
                  <li key={field} className="flex items-start gap-2">
                    <AlertIcon size={16} className="mt-0.5 shrink-0 text-danger-300" />
                    <a
                      href={`#${fieldId(field)}`}
                      className="text-hint u-settle text-danger-300 underline decoration-1 underline-offset-4 hover:decoration-2"
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
            <div className="flex items-start gap-3 rounded-field border border-danger-300 bg-ink-800 px-4 py-4">
              <AlertIcon size={18} className="mt-0.5 shrink-0 text-danger-300" />
              <div>
                <p className="text-body text-text-primary">{formError.message}</p>
                {formError.correlationId ? (
                  <p className="text-hint mt-1 text-text-muted">Código: {formError.correlationId}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/*
          A visually-hidden legend, so the group is announced without the panel gaining a second
          heading that competes with the section's own (section 9.1).
        */}
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
                {/* Label above the input, always. No floating labels, no placeholder-as-label. */}
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
                  className={`${FIELD_CLASS} ${message ? 'border-danger-300' : 'border-border-strong'}`}
                />
                {hint ? (
                  <p id={hintId(field)} className="text-hint text-text-muted">
                    {hint}
                  </p>
                ) : null}
                {message ? (
                  // The error is never carried by colour alone: it is text, it carries an icon, it
                  // is associated with the input through aria-describedby, and the input is
                  // aria-invalid.
                  <p
                    id={errorId(field)}
                    className="text-hint flex items-start gap-1.5 text-danger-300"
                  >
                    <AlertIcon size={16} className="mt-0.5 shrink-0" />
                    <span>{message}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-2">
          <p id={`${fieldsetId}-challenge`} className="text-micro-label text-text-muted uppercase">
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
            onPointerDown={() => {
              pressingSubmit.current = true;
            }}
            onClick={(event) => {
              if (isPending) event.preventDefault();
            }}
            className={`${CTA_PRIMARY} w-full sm:w-auto sm:self-start aria-disabled:cursor-wait aria-disabled:opacity-80`}
          >
            {isPending ? <SpinnerIcon /> : null}
            {isPending ? FORM_COPY.submitting : FORM_COPY.submit}
          </button>

          <p aria-live="polite" className="text-hint empty:hidden text-text-muted">
            {isPending && waitedLong ? FORM_COPY.stillWaiting : ''}
          </p>

          <p className="text-hint text-text-muted">
            {FORM_COPY.privacy}{' '}
            <Link href="/privacidade" className={CTA_TERTIARY}>
              Como usamos seus dados
            </Link>
          </p>
        </div>
      </form>
    </Panel>
  );
}

/**
 * The form's container — section 9.1.
 *
 * An `ink-800` surface with a hairline border and no shadow. Elevation on a dark page comes from
 * surface lightness; a shadow against navy is invisible and would only cost a paint. The outcome
 * panel reuses this exact container so that replacing the fieldset does not move the page.
 */
function Panel({
  children,
  accent,
  ...rest
}: {
  children: React.ReactNode;
  /** The outcome's accent border (section 9.7). Defaults to the neutral hairline. */
  accent?: string;
} & React.HTMLAttributes<HTMLDivElement> &
  React.RefAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`rounded-panel border bg-ink-800 p-6 sm:p-8 ${accent ?? 'border-ink-600'}`}
    >
      {children}
    </div>
  );
}

/**
 * The terminal panel — sections 6.1 and 9.7.
 *
 * It replaces the fieldset **in place**: same container, same width, so the page does not jump. It
 * is announced politely and receives focus, so a screen-reader user is taken to the answer rather
 * than told that one exists somewhere. The 200ms cross-fade is applied to content that is already
 * present and already announced — nothing about the success state waits on an animation to finish.
 *
 * The panel's accent border is the only thing that differs by outcome, plus the secondary actions
 * the confirmed and waitlisted answers offer. Those are secondary buttons, never a second primary.
 *
 * **No outcome echoes personal data.** The duplicate panel in particular carries neither the name
 * nor the age, so guessing a phone number reveals nothing about whose it is.
 */
const OUTCOME_ACCENT: Readonly<Record<RegistrationOutcome['kind'], string>> = {
  confirmed: 'border-success-300',
  waitlisted: 'border-sky-300',
  already_registered: 'border-border-strong',
  // Not an error and not a success: the person is eligible, just not through this form.
  age_not_eligible: 'border-border-strong',
  full: 'border-border-strong',
  closed: 'border-border-strong',
  invalid: 'border-border-strong',
  error: 'border-border-strong',
};

function OutcomePanel({
  ref,
  outcome,
  links,
}: {
  ref: React.Ref<HTMLDivElement>;
  outcome: RegistrationOutcome;
  links: EventLinks;
}) {
  const copy = outcomeCopy(outcome);

  return (
    <Panel
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      data-outcome={outcome.kind}
      accent={`${OUTCOME_ACCENT[outcome.kind]} u-outcome`}
    >
      <div className="flex flex-col gap-4">
        {outcome.kind === 'confirmed' ? (
          <p className="text-micro-label text-success-300 uppercase">Tudo certo</p>
        ) : null}

        <h3 className="text-h2 font-stretch-[105%] text-text-primary">{copy.heading}</h3>

        {copy.body.map((paragraph) => (
          <p key={paragraph} className="text-body max-w-[52ch]">
            {paragraph}
          </p>
        ))}

        {outcome.kind === 'confirmed' ? (
          <OutcomeActions links={links} calendar share />
        ) : outcome.kind === 'waitlisted' ? (
          <OutcomeActions links={links} />
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * The confirmation's secondary actions (PRODUCT-SPEC.md section 6.1).
 *
 * All three are secondary buttons: the person has already done the one thing this page asks of
 * them, so nothing here may look like a primary action.
 *
 * `Compartilhar` uses the Web Share sheet where the platform has one and falls back to copying the
 * link where it does not, rather than being conditionally rendered — a button that appears only
 * after hydration on some devices is a layout shift and a support question.
 */
function OutcomeActions({
  links,
  calendar = false,
  share = false,
}: {
  links: EventLinks;
  calendar?: boolean;
  share?: boolean;
}) {
  const [shareNote, setShareNote] = useState('');

  async function handleShare() {
    const payload = { title: links.shareTitle, url: links.page };

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(links.page);
      setShareNote('Link copiado.');
    } catch {
      // A cancelled share sheet and a denied clipboard both land here, and neither is a failure
      // worth interrupting someone over: the link is on screen either way.
      setShareNote('');
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {/*
        Stacked and full width on a phone — three pills of different widths on three lines read as
        leftovers; from `sm` they sit on one row where their natural widths are the composition.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {calendar ? (
          <a className={`${CTA_SECONDARY} w-full sm:w-auto`} href={links.calendar} download>
            <CalendarIcon size={18} />
            Adicionar ao calendário
          </a>
        ) : null}

        {links.map ? (
          <a
            className={`${CTA_SECONDARY} w-full sm:w-auto`}
            href={links.map}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPinIcon size={18} />
            Como chegar
          </a>
        ) : null}

        {share ? (
          <button
            type="button"
            className={`${CTA_SECONDARY} w-full sm:w-auto`}
            onClick={handleShare}
          >
            <ShareIcon size={18} />
            Compartilhar
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="text-hint empty:hidden text-text-muted">
        {shareNote}
      </p>
    </div>
  );
}
