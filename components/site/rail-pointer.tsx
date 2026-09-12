'use client';

/**
 * The counting rail's pointer response — VISUAL-DIRECTION.md section 7.4.
 *
 * Two numbers, and that is the entire island. It writes the pointer's position in the viewport,
 * normalised to −1…1, onto the rail as `--rail-x` / `--rail-y`; the stylesheet decides what that
 * means — a couple of degrees of parallax on the object, a few units of drift on the nearer bead
 * groups, each damped by its own transition. No element is measured, no geometry is read, and
 * nothing here knows what a bead is.
 *
 * **It attaches to almost nobody.** A fine pointer, a viewport at `lg` or wider — where the object
 * exists at all — and no reduced-motion preference. A touch device never runs a line of it: there is
 * no hover on a phone, and a tilt that fires on tap and then sticks is exactly the gimmick section
 * 10.4 exists to prevent. The listener is added and removed as those conditions change, so rotating
 * a tablet does not leave a dead listener behind.
 *
 * **Cost.** One passive `pointermove`, one `requestAnimationFrame`, two custom property writes per
 * frame, on one element whose subtree is six `<g>` elements deep. Nothing else on the page reads
 * these properties, so a frame invalidates the style of the rail and of nothing else.
 *
 * Additive like every other island here: with JavaScript off the properties keep their registered
 * initial value of `0`, which is the object's resting composition.
 */

import { useEffect } from 'react';

const RAIL_SELECTOR = '[data-counting-rail]';

/** The conditions under which the object is both present and safe to animate. */
const POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const WIDTH_QUERY = '(width >= 64rem)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function clamp(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

export function RailPointer() {
  useEffect(() => {
    const found = document.querySelector<HTMLElement>(RAIL_SELECTOR);
    // Below `lg` the object is not rendered at all, and neither is anything here.
    if (!found) return;
    // Re-bound so the listeners below close over a non-nullable reference rather than a narrowed one.
    const rail = found;

    const pointer = window.matchMedia(POINTER_QUERY);
    const wide = window.matchMedia(WIDTH_QUERY);
    const reduced = window.matchMedia(REDUCED_QUERY);

    let frame = 0;
    let x = 0;
    let y = 0;
    let listening = false;

    function write() {
      frame = 0;
      rail.style.setProperty('--rail-x', x.toFixed(3));
      rail.style.setProperty('--rail-y', y.toFixed(3));
    }

    function schedule() {
      if (frame === 0) frame = requestAnimationFrame(write);
    }

    function onMove(event: PointerEvent) {
      // A stylus or a finger on a hybrid machine drives nothing, whatever the media query says.
      if (event.pointerType !== 'mouse') return;
      x = clamp((event.clientX / window.innerWidth) * 2 - 1);
      y = clamp((event.clientY / window.innerHeight) * 2 - 1);
      schedule();
    }

    /** The pointer left the document: the object returns to the composition it was designed as. */
    function onLeave() {
      x = 0;
      y = 0;
      schedule();
    }

    function sync() {
      const wanted = pointer.matches && wide.matches && !reduced.matches;
      if (wanted === listening) return;
      listening = wanted;

      if (wanted) {
        window.addEventListener('pointermove', onMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onLeave);
        return;
      }

      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      onLeave();
    }

    sync();
    for (const query of [pointer, wide, reduced]) query.addEventListener('change', sync);

    return () => {
      cancelAnimationFrame(frame);
      for (const query of [pointer, wide, reduced]) query.removeEventListener('change', sync);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      rail.style.removeProperty('--rail-x');
      rail.style.removeProperty('--rail-y');
    };
  }, []);

  return null;
}
