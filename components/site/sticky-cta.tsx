'use client';

/**
 * The mobile sticky call to action — PRODUCT-SPEC.md section 4.5, VISUAL-DIRECTION.md sections 9.8
 * and 11.2.
 *
 * **It is an anchor, not a launcher.** It scrolls to `#inscricao`, which is a section of the page
 * that is already there. Nothing is hidden behind it, there is no dialog, no focus trap and no
 * scroll lock.
 *
 * Its whole job is the thumb zone: on a phone the primary action must be either in the hero or in
 * this bar, never only somewhere in the middle of the page. So it obeys two rules, and the second
 * is the one that keeps it from being a nag:
 *
 *   1. It appears once the hero's CTA has scrolled out of view.
 *   2. **It disappears again as soon as the form itself is in view.** A bar that stayed would cover
 *      a field, a validation message or a focus ring — and `scroll-padding-bottom` (globals.css)
 *      already reserves its height so a focused field is never scrolled behind it (SC 2.4.11).
 *
 * **Mobile only.** Above `md` it is `display: none`, which also keeps it out of the accessibility
 * tree entirely rather than leaving a second copy of the primary action for a desktop reader.
 *
 * One observer, two targets, no scroll listener: scroll-linked work on every frame is exactly the
 * INP risk section 10.4 forbids.
 */

import { useEffect, useRef, useState } from 'react';

export function StickyCta({
  label,
  targetId,
  /** The element whose visibility means "the CTA is already on screen" — the hero's own button. */
  heroCtaId,
}: {
  readonly label: string;
  readonly targetId: string;
  readonly heroCtaId: string;
}) {
  const [shown, setShown] = useState(false);
  const visible = useRef({ hero: true, form: false });

  useEffect(() => {
    const hero = document.getElementById(heroCtaId);
    const form = document.getElementById(targetId);
    if (!hero && !form) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.id === heroCtaId) visible.current.hero = entry.isIntersecting;
          if (entry.target.id === targetId) visible.current.form = entry.isIntersecting;
        }
        setShown(!visible.current.hero && !visible.current.form);
      },
      // A sliver of the form counts as "in view": by the time its top edge appears, the bar is
      // already close enough to the fields to be in the way.
      { threshold: 0 },
    );

    if (hero) observer.observe(hero);
    if (form) observer.observe(form);

    return () => observer.disconnect();
  }, [heroCtaId, targetId]);

  return (
    <div
      // `visibility` rather than a conditional render: it keeps the element out of the
      // accessibility tree while hidden, the same way `display: none` would, but still allows the
      // 250ms transition in and out (section 10.3).
      data-shown={shown}
      className={[
        'fixed inset-x-0 bottom-0 z-30 md:hidden',
        // Opaque, not translucent: a see-through bar over scrolling type is the glassmorphism
        // section 14 bans, and it would put moving content behind a control.
        'border-t border-ink-600 bg-ink-800 px-5 pt-3',
        'pb-[calc(12px+env(safe-area-inset-bottom,0px))]',
        'invisible translate-y-full opacity-0',
        'data-[shown=true]:visible data-[shown=true]:translate-y-0 data-[shown=true]:opacity-100',
        'transition-[opacity,transform,visibility] duration-250 ease-[var(--ease-rise)]',
        'motion-reduce:transition-none',
      ].join(' ')}
    >
      <a
        href={`#${targetId}`}
        className={[
          'u-press flex min-h-14 w-full items-center justify-center rounded-full',
          'bg-gold-400 px-6 text-label font-bold text-ink-900',
          'focus-visible:outline-ink-900',
        ].join(' ')}
      >
        {label}
      </a>
    </div>
  );
}
