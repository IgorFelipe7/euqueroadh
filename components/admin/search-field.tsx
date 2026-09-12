'use client';

/**
 * The list's search box.
 *
 * All view state lives in the URL, so a filtered view can be bookmarked, shared between organizers
 * and reloaded without loss (ADMIN-SPEC.md section 4.1). This component's whole job is to keep the
 * URL in step with what is being typed, without three things going wrong:
 *
 *   * **300 ms debounce**, so a five-letter name is one query rather than five.
 *   * **`replace`, not `push`**, so typing does not fill the browser's back button with every
 *     prefix of a name.
 *   * **`useTransition`**, so the existing rows stay visible at reduced opacity while the new page
 *     loads. Blanking the table on every keystroke makes search feel broken.
 *
 * With JavaScript unavailable the surrounding `<form>` still submits on Enter, which is why the
 * field is a real form control with a real name.
 *
 * The rest of the view arrives as two plain strings rather than as an object, so the debounce
 * effect depends on values rather than on an object identity that changes every render — an object
 * prop here would restart the timer on each keystroke's re-render and the search would never fire.
 */

import { useEffect, useId, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { INPUT_CLASS } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';

const DEBOUNCE_MS = 300;

export function SearchField({
  initialValue,
  status,
  sort,
}: {
  initialValue: string;
  /** The current status filter, or '' for the default — carried through so search does not reset it. */
  status: string;
  sort: string;
}) {
  const [value, setValue] = useState(initialValue);
  /** The last term that has actually reached the URL. */
  const [committed, setCommitted] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = useId();

  /*
   * The URL is the source of truth: when it changes underneath — a status chip, a page link, the
   * back button — the field follows it rather than fighting it.
   *
   * This is React's own "a prop changed, derive from it" pattern: state adjusted *during* render,
   * not in an effect. Doing it in an effect would commit one frame showing the old term, which on a
   * back-button press is the previous search visibly flashing before the current one appears.
   */
  const [seenInitial, setSeenInitial] = useState(initialValue);

  if (initialValue !== seenInitial) {
    setSeenInitial(initialValue);
    setValue(initialValue);
    setCommitted(initialValue);
  }

  useEffect(() => {
    if (value.trim() === committed.trim()) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (sort) params.set('sort', sort);
      if (value.trim()) params.set('q', value.trim());
      // A new search starts at the first page; staying on page 4 of the old result set is a blank
      // screen that looks like "nothing found".

      const query = params.toString();
      setCommitted(value);
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, committed, status, sort, pathname, router]);

  return (
    <div className="flex w-full flex-col gap-1 sm:max-w-80">
      <label htmlFor={fieldId} className="text-hint font-semibold text-admin-ink">
        {ADMIN_COPY.registrations.searchLabel}
      </label>
      <input
        id={fieldId}
        name="q"
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(field) => setValue(field.target.value)}
        placeholder={ADMIN_COPY.registrations.searchPlaceholder}
        aria-busy={isPending}
        className={`${INPUT_CLASS} ${isPending ? 'opacity-70' : ''}`}
      />
    </div>
  );
}
