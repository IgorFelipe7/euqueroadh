'use client';

/**
 * The door screen's list, and its one action.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 1.3. This is the only admin screen used **standing up, one
 * handed, in a queue, possibly on bad 4G**, and every decision here follows from that:
 *
 *   * **One name, one 56 px button per row.** Not a table. At arm's length, in a corridor, the
 *     target is the whole point and everything else is context.
 *   * **Optimistic.** The button responds on tap and reconciles when the server answers, because a
 *     500 ms round trip with no feedback is how an organizer taps twice. A failure reverts the row
 *     and says why, rather than leaving a lie on screen.
 *   * **It works without JavaScript.** Each row is a real `<form>` posting a Server Action; the
 *     optimistic state is the only thing lost.
 *
 * `useOptimistic` is keyed by row rather than held for the list, so two organizers checking in two
 * different people never contend for one piece of state.
 */

import { useActionState, useOptimistic, useTransition } from 'react';

import { setAttendanceAction } from '@/app/admin/(protected)/actions';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Notice } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';
import { IDLE } from '@/lib/admin/state';
import type { AdminRegistration } from '@/lib/data/admin/registrations';
import { formatTime } from '@/lib/domain/format';

function AttendanceRow({ person }: { person: AdminRegistration }) {
  const [state, submit] = useActionState(setAttendanceAction, IDLE);
  const [pending, startTransition] = useTransition();

  /*
   * The server's answer wins as soon as it exists: `state.attendedAt` is the value the database
   * actually recorded, which is not necessarily `now()` — checking in someone already present
   * returns their original arrival time, because `attended_at` is assigned once.
   */
  const settled = state.status === 'ok' ? (state.attendedAt ?? null) : person.attendedAt;
  const [optimistic, setOptimistic] = useOptimistic(settled);

  const present = optimistic !== null;

  function act(next: boolean) {
    const formData = new FormData();
    formData.set('registrationId', person.id);
    formData.set('present', String(next));

    startTransition(() => {
      setOptimistic(next ? new Date().toISOString() : null);
      submit(formData);
    });
  }

  return (
    <li className="flex flex-col gap-2 border-b border-admin-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[1.0625rem] leading-snug font-semibold text-admin-ink">
          {person.fullName}
        </span>
        <span className="text-hint text-admin-muted">
          {person.age} anos
          {present && optimistic
            ? ` · ${ADMIN_COPY.attendance.arrivedAt(formatTime(new Date(optimistic)))}`
            : null}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {present ? (
          <button
            type="button"
            onClick={() => act(false)}
            disabled={pending}
            /*
             * Confirmed-green fill with the undo affordance beside it, rather than a checkbox: the
             * state must be readable from two metres away, and the label carries the meaning so
             * colour is never the only signal.
             */
            className={`${BUTTON_SECONDARY} min-h-14 border-status-confirmed bg-status-confirmed-soft px-5 text-status-confirmed hover:border-status-confirmed hover:text-status-confirmed`}
          >
            <span aria-hidden="true">✓</span>
            {ADMIN_COPY.attendance.present}
            <span className="text-hint font-normal">· {ADMIN_COPY.attendance.undo}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => act(true)}
            disabled={pending}
            className={`${BUTTON_PRIMARY} min-h-14 px-6`}
          >
            {pending ? ADMIN_COPY.attendance.marking : ADMIN_COPY.attendance.mark}
          </button>
        )}
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-hint basis-full text-admin-danger sm:text-right">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}

export function AttendanceList({ people, term }: { people: readonly AdminRegistration[]; term: string }) {
  if (people.length === 0) {
    return (
      <Notice tone="info">
        {term ? ADMIN_COPY.attendance.emptySearch(term) : ADMIN_COPY.attendance.empty}
      </Notice>
    );
  }

  return (
    <ul className="flex flex-col">
      {people.map((person) => (
        <AttendanceRow key={person.id} person={person} />
      ))}
    </ul>
  );
}
