'use client';

/**
 * Section entrances — VISUAL-DIRECTION.md sections 10.3 and 10.5.
 *
 * One `IntersectionObserver` for the whole page, shared by every section that opts in, firing once
 * per element at 15% visibility. About twenty lines, which is the whole reason `motion` is not a
 * dependency (section 10.7): nothing here needs springs, gestures, layout or exit animation.
 *
 * **The reveal is additive, and that is a correctness property rather than a preference.** The
 * stylesheet never hides anything. `opacity: 0` exists only under `.js-reveal`, a class this
 * component adds on mount — so a script error, a slow bundle or a blocked domain leaves the page
 * fully readable instead of blank. Content is visible by default and *becomes* animated, never the
 * reverse.
 *
 * It also stops at the first section below the fold (section 10.4): a page that keeps animating as
 * you scroll reads as cheap, not as premium. Sections opt in individually.
 */

import { useEffect } from 'react';

/** The class the stylesheet keys its initial state off. Present only once JavaScript has run. */
const ACTIVE_CLASS = 'js-reveal';
const TARGET_SELECTOR = '.u-reveal';

export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
    if (targets.length === 0) return;

    /*
     * Anything already on screen is marked revealed **synchronously, before the class is added**.
     * An IntersectionObserver reports on a later frame, so leaving it to the callback would show
     * one frame of `opacity: 0` on content the person is already looking at — a flash on arrival,
     * which is the opposite of what an entrance is for.
     */
    for (const target of targets) {
      const box = target.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        target.setAttribute('data-revealed', 'true');
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-revealed', 'true');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );

    root.classList.add(ACTIVE_CLASS);
    for (const target of targets) {
      if (target.getAttribute('data-revealed') !== 'true') observer.observe(target);
    }

    return () => {
      observer.disconnect();
      root.classList.remove(ACTIVE_CLASS);
    };
  }, []);

  return null;
}
