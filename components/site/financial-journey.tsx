'use client';

/**
 * The page's one motion controller — VISUAL-DIRECTION.md sections 10.1, 10.8 and 10.9.
 *
 * **One measurement, one polyline, one frame loop, four drivers.** It reads every
 * `[data-journey-point]` the page has laid out, builds a single chart-like polyline through them,
 * slices that polyline across the `[data-journey-segment]` canvases, and then — inside a single
 * `requestAnimationFrame`, from a single passive `scroll` listener — drives everything on the page
 * that answers to the reader's position:
 *
 *   * **Draw** — `stroke-dashoffset` per segment (section 10.8).
 *   * **Reach** — `data-reached` on every node and cue, which is how the counting rail's accents and
 *     the Detalhes section's arrival know the line got there (section 10.9).
 *   * **Head** — the exact tip of the drawn stroke, from `getPointAtLength` on the one segment that
 *     is partly drawn: a short brighter run of the stroke plus a small bloom.
 *   * **Scrub** — the hero's scroll position, normalised over the counting rail's own height and
 *     smoothed, written as one custom property the rail's bead groups read (section 7.4).
 *
 * Section 10.4 rules out scroll work that measures layout, and it is right to: a scroll handler that
 * measures is an INP defect waiting to happen. This one never measures on scroll. The costs are
 * separated deliberately:
 *
 *   * **Geometry** — every `getBoundingClientRect` on the page — runs on mount, on resize, and when
 *     the document's own height changes (a lazily loaded poster, an error summary appearing). Never
 *     during a scroll.
 *   * **Painting** reads two numbers off `window` and writes custom properties and two attributes,
 *     on at most three elements per frame, skipping every write whose value is unchanged.
 *
 * **The convergence tail** (section 10.1, rule 3) is the one thing here that outlives the input that
 * started it. After a scroll, two values — the rail's scrub position and the line's energy —
 * interpolate toward their targets across a few frames so the movement has mass. The loop keeps
 * itself alive only while they are still converging, and it is bounded twice: by an explicit epsilon
 * and by a hard ceiling in milliseconds. At rest, no frame is scheduled at all.
 *
 * **Reduced motion is a different program, not a faster one** (section 10.6). The geometry is still
 * built and the line is still there — complete, drawn end to end, every node settled — but the
 * scroll listener is never attached, no head is drawn, the rail never scrubs, and no frame work ever
 * happens.
 */

import { useEffect } from 'react';

/**
 * How far down the viewport the drawn tip sits.
 *
 * Low on purpose. It has to clear the date lockup — which sits in the bottom fifth of the hero — on
 * the first frame, or the page would arrive with its signature element undrawn and the opening
 * sequence would have nothing to open. Everywhere below the hero the effect is the same one a
 * smaller value gives: the line is already drawn where the reader is looking, and reaches into the
 * section they are about to meet.
 */
const LEAD = 0.82;

/** The opening draw, matched to the hero's entrance so the two read as one arrival. */
const ENTRANCE_MS = 1200;

const POINT_SELECTOR = '[data-journey-point]';
const SEGMENT_SELECTOR = '[data-journey-segment]';
const LINE_SELECTOR = '.u-journey-line';
const TAIL_SELECTOR = '.u-journey-tail';
const HEAD_SELECTOR = '.u-journey-head';
const RAIL_SELECTOR = '[data-counting-rail]';

/**
 * Everything that wants to know when the tip has passed it: the five visible nodes, and the cues the
 * counting rail's accents and the Detalhes arrival move on. One selector, one pass, the same
 * `data-reached` flag — so a second scroll-driven element on this page costs nothing beyond the
 * element itself.
 *
 * Reversible, deliberately. Scroll back up and the line retracts, the dots fade and the beads return
 * to where they were: the whole system reads the reader's position rather than remembering it.
 */
const REACH_SELECTOR = '[data-journey-node], [data-journey-cue]';

/** Marks the page as drawing the journey; the stylesheet keys the layer's visibility off it. */
const READY_ATTRIBUTE = 'data-journey';
/** Present only for the opening draw, and dropped the moment the reader takes over by scrolling. */
const ENTRANCE_ATTRIBUTE = 'data-journey-entrance';
/** On the one segment that is currently part-drawn: the only one allowed to show a head. */
const LIVE_ATTRIBUTE = 'data-journey-live';

/* ------------------------------------------------------------------------------------------------
 * The convergence tail — section 10.1, rule 3.
 *
 * `FOLLOW` and `ENERGY_DECAY` are geometric, so both values reach `EPSILON` in about 35 frames —
 * roughly 580ms at 60Hz, which is why the ceiling is 900ms. The ceiling is not the mechanism; it is
 * the guarantee that a float that will not quite converge can never leave a frame loop running.
 * ---------------------------------------------------------------------------------------------- */

const EPSILON = 0.002;
/** How much of the remaining distance the scrub closes each frame. */
const FOLLOW = 0.18;
/** How much of its energy the line keeps each frame once the reader stops. */
const ENERGY_DECAY = 0.82;
/** Scroll speed, in px per 16ms, that counts as full energy. A flick; not a nudge. */
const ENERGY_SPAN = 90;
/** The hard stop for a self-scheduled tail, whatever the arithmetic does. */
const TAIL_CEILING_MS = 900;

/**
 * Where the energy response is allowed to run at all.
 *
 * Off below 768px until it has been profiled on a weak device: a phone is the one place where a few
 * extra style writes per scroll frame can actually be felt, and the head alone already carries the
 * reading. Section 10.9.
 */
const ENERGY_QUERY = '(width >= 48rem)';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Segment {
  readonly canvas: SVGSVGElement;
  readonly line: SVGPathElement;
  /** The short brighter run at the leading end, and the bloom at its tip. Both optional. */
  readonly tail: SVGPathElement | null;
  readonly head: SVGGElement | null;
  /** Page-space `y` of each vertex in this slice, ascending. */
  readonly ys: readonly number[];
  /** Cumulative path length at each vertex, in the same order. */
  readonly lengths: readonly number[];
  readonly total: number;
  /** The last offset written, so an unchanged frame costs nothing. */
  written: number;
}

/** A node or a cue: anything that wants `data-reached` written when the tip passes its height. */
interface NodeMark {
  readonly element: HTMLElement;
  readonly y: number;
}

/** The counting rail, and the scroll range its scrub is normalised over (section 7.4). */
interface Scrub {
  readonly element: HTMLElement;
  /** Scroll distance from the top of the page to the object leaving the top of the viewport. */
  readonly span: number;
}

interface Geometry {
  readonly segments: readonly Segment[];
  readonly nodes: readonly NodeMark[];
  readonly scrub: Scrub | null;
}

/**
 * The lateral swing of each intermediate vertex, cycled rather than randomised.
 *
 * Evenly spaced peaks of equal height read as a sawtooth — a texture, not a market (section 7.1
 * makes the same point about the motif). Four uneven values are enough to break the pattern, and
 * being fixed they survive a resize without the line reshuffling itself.
 */
const SWING = [1, 0.5, 0.82, 0.36];

function cssLength(styles: CSSStyleDeclaration, property: string, fallback: number): number {
  const value = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Every laid-out point, in page coordinates, ordered down the page. */
function readPoints(): Point[] {
  const points: { element: HTMLElement; x: number; y: number }[] = [];

  for (const element of document.querySelectorAll<HTMLElement>(POINT_SELECTOR)) {
    // `offsetParent` is null for anything inside a `display: none` subtree, which is exactly how a
    // point belonging to another breakpoint's composition excludes itself.
    if (element.offsetParent === null) continue;
    const box = element.getBoundingClientRect();
    points.push({
      element,
      x: box.left + box.width / 2 + window.scrollX,
      y: box.top + box.height / 2 + window.scrollY,
    });
  }

  // Stable, so two points placed at the same height keep their authored order — which is how the
  // hero's run along one rail of the counting rail stays a run rather than a reversal.
  points.sort((a, b) => a.y - b.y);
  return points;
}

/**
 * The chart rhythm. Long runs between two authored points are broken by one to three intermediate
 * vertices swung sideways, which is what turns a rail into a trajectory.
 *
 * The swing is horizontal only, so the polyline stays monotonic in `y`. That single property is
 * what lets the scroll position map onto path length at all, and it is why the line can never
 * double back over content it has already passed.
 */
function subdivide(anchors: readonly Point[], swing: number, step: number, maxX: number): Point[] {
  const points: Point[] = [anchors[0]];
  let index = 0;

  for (let i = 1; i < anchors.length; i += 1) {
    const from = anchors[i - 1];
    const to = anchors[i];
    const rise = to.y - from.y;
    const count = clamp(Math.round(rise / step) - 1, 0, 3);

    for (let k = 1; k <= count; k += 1) {
      const t = k / (count + 1);
      const direction = index % 2 === 0 ? 1 : -1;
      const x = from.x + (to.x - from.x) * t + direction * swing * SWING[index % SWING.length];
      index += 1;
      points.push({ x: clamp(x, 4, maxX), y: from.y + rise * t });
    }

    points.push(to);
  }

  return points;
}

/** The part of the polyline inside `[top, bottom]`, with the crossing edges cut exactly at the boundary. */
function sliceBetween(points: readonly Point[], top: number, bottom: number): Point[] {
  const slice: Point[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (to.y < top || from.y > bottom) continue;

    const span = to.y - from.y;
    const cut = (y: number, fallback: Point): Point =>
      span === 0 ? fallback : { x: from.x + ((to.x - from.x) * (y - from.y)) / span, y };

    const start = from.y < top ? cut(top, from) : from;
    const end = to.y > bottom ? cut(bottom, to) : to;

    if (slice.length === 0) slice.push(start);
    slice.push(end);
  }

  return slice;
}

function toPathData(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

/**
 * Rebuild everything from the page's current layout.
 *
 * `initial` parks every segment at its undrawn state instead of at its scroll position, so the
 * opening draw has somewhere to start. Later rebuilds — a resize, the poster finally loading — must
 * not do that, or the line would redraw itself from nothing every time the page moved.
 */
function measure(initial: boolean): Geometry {
  const anchors = readPoints();
  if (anchors.length < 2) return { segments: [], nodes: [], scrub: null };

  const styles = getComputedStyle(document.documentElement);
  const swing = cssLength(styles, '--journey-swing', 8);
  const step = cssLength(styles, '--journey-step', 200);
  const points = subdivide(anchors, swing, step, document.documentElement.clientWidth - 4);

  const segments: Segment[] = [];

  for (const canvas of document.querySelectorAll<SVGSVGElement>(SEGMENT_SELECTOR)) {
    const line = canvas.querySelector<SVGPathElement>(LINE_SELECTOR);
    if (!line) continue;

    const box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;

    const top = box.top + window.scrollY;
    const slice = sliceBetween(points, top, top + box.height);
    const tail = canvas.querySelector<SVGPathElement>(TAIL_SELECTOR);
    const head = canvas.querySelector<SVGGElement>(HEAD_SELECTOR);

    if (slice.length < 2) {
      line.removeAttribute('d');
      tail?.removeAttribute('d');
      continue;
    }

    canvas.setAttribute(
      'viewBox',
      `${(box.left + window.scrollX).toFixed(1)} ${top.toFixed(1)} ${box.width.toFixed(1)} ${box.height.toFixed(1)}`,
    );

    // One viewBox unit is one page pixel, which is what lets the head be positioned from
    // `getPointAtLength` without a second coordinate system in between.
    const data = toPathData(slice);
    line.setAttribute('d', data);
    tail?.setAttribute('d', data);

    const ys: number[] = [slice[0].y];
    const lengths: number[] = [0];
    let total = 0;

    for (let i = 1; i < slice.length; i += 1) {
      total += Math.hypot(slice[i].x - slice[i - 1].x, slice[i].y - slice[i - 1].y);
      ys.push(slice[i].y);
      lengths.push(total);
    }

    canvas.style.setProperty('--journey-length', total.toFixed(1));
    if (initial) canvas.style.setProperty('--journey-offset', total.toFixed(1));

    segments.push({
      canvas,
      line,
      tail,
      head,
      ys,
      lengths,
      total,
      written: initial ? total : -1,
    });
  }

  const nodes: NodeMark[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(REACH_SELECTOR)) {
    if (element.offsetParent === null) continue;
    const box = element.getBoundingClientRect();
    nodes.push({ element, y: box.top + box.height / 2 + window.scrollY });
  }

  /*
   * The counting rail's scrub range: from the top of the page to the moment the object's own bottom
   * edge leaves the top of the viewport. Taken from the object's rendered box rather than from a
   * formula, so it follows the rail at every width and is simply absent where the rail is not
   * rendered at all (below `lg`, where `offsetParent` is null).
   */
  const railElement = document.querySelector<HTMLElement>(RAIL_SELECTOR);
  let scrub: Scrub | null = null;
  if (railElement && railElement.offsetParent !== null) {
    const box = railElement.getBoundingClientRect();
    scrub = { element: railElement, span: Math.max(box.bottom + window.scrollY, 1) };
  }

  return { segments, nodes, scrub };
}

/** How much of a segment is drawn when the tip has reached `y`. Linear within the edge it falls in. */
function drawnLength(segment: Segment, y: number): number {
  const { ys, lengths } = segment;
  if (y <= ys[0]) return 0;
  if (y >= ys[ys.length - 1]) return segment.total;

  for (let i = 1; i < ys.length; i += 1) {
    if (y > ys[i]) continue;
    const span = ys[i] - ys[i - 1];
    const t = span === 0 ? 1 : (y - ys[i - 1]) / span;
    return lengths[i - 1] + (lengths[i] - lengths[i - 1]) * t;
  }

  return segment.total;
}

export function FinancialJourney() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const energetic = window.matchMedia(ENERGY_QUERY);

    let geometry: Geometry = { segments: [], nodes: [], scrub: null };
    let frame = 0;
    let stale = false;
    let entrance = 0;

    /** The two values that outlive their input, and the state the tail needs to bound itself. */
    let scrubValue = 0;
    let energy = 0;
    let lastScrollY = 0;
    let lastTime = 0;
    let deadline = 0;
    let live: Segment | null = null;
    let writtenScrub = -1;
    let writtenEnergy = -1;

    function setLive(segment: Segment | null) {
      if (segment === live) return;
      live?.canvas.removeAttribute(LIVE_ATTRIBUTE);
      segment?.canvas.setAttribute(LIVE_ATTRIBUTE, '');
      live = segment;
    }

    function paint(now: number) {
      frame = 0;

      if (stale) {
        stale = false;
        geometry = measure(false);
        live = null;
      }

      const still = reduced.matches;
      const scrollY = window.scrollY;

      // Under reduced motion the tip is past the end of the page, so everything is simply complete.
      const tip = still ? Number.POSITIVE_INFINITY : scrollY + window.innerHeight * LEAD;

      /* ---- Draw, and find the one segment the tip is inside. ---- */
      let active: Segment | null = null;
      let activeDrawn = 0;

      for (const segment of geometry.segments) {
        const drawn = drawnLength(segment, tip);
        const offset = Math.round((segment.total - drawn) * 10) / 10;

        if (offset !== segment.written) {
          segment.written = offset;
          segment.canvas.style.setProperty('--journey-offset', offset.toFixed(1));
        }

        if (active === null && drawn > 1 && drawn < segment.total - 1) {
          active = segment;
          activeDrawn = drawn;
        }
      }

      /* ---- Reach: every node and cue, in one pass. ---- */
      for (const node of geometry.nodes) {
        const reached = tip >= node.y ? 'true' : 'false';
        if (node.element.dataset.reached !== reached) node.element.dataset.reached = reached;
      }

      if (still) return;

      /* ---- Energy: scroll speed, normalised per 16ms and decayed each frame. ---- */
      const elapsed = lastTime === 0 ? 16 : clamp(now - lastTime, 4, 64);
      const speed = (Math.abs(scrollY - lastScrollY) / elapsed) * 16;
      lastScrollY = scrollY;
      lastTime = now;

      energy = energetic.matches
        ? Math.max(energy * ENERGY_DECAY, clamp(speed / ENERGY_SPAN, 0, 1))
        : 0;
      if (energy < EPSILON) energy = 0;

      /* ---- Head: the tip of the drawn stroke, on the live segment only. ---- */
      setLive(active);

      if (active) {
        const rounded = Math.round(energy * 100) / 100;
        if (rounded !== writtenEnergy) {
          writtenEnergy = rounded;
          active.canvas.style.setProperty('--journey-energy', rounded.toFixed(2));
        }

        if (active.head) {
          // One attribute, not two: the head is a group so the bloom and the core move together.
          const point = active.line.getPointAtLength(activeDrawn);
          active.head.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
        }

        if (active.tail) {
          // The last `length` px of what is drawn, and nothing else: one dash, positioned so its
          // leading end sits exactly on the tip. See VISUAL-DIRECTION.md section 10.9.
          const length = 24 + energy * 46;
          active.tail.style.strokeDasharray = `${length.toFixed(1)} ${(active.total + length).toFixed(1)}`;
          active.tail.style.strokeDashoffset = (length - activeDrawn).toFixed(1);
        }
      }

      /* ---- Scrub: the hero's scroll position, smoothed, for the counting rail. ---- */
      const scrub = geometry.scrub;
      let target = scrubValue;

      if (scrub) {
        target = clamp(scrollY / scrub.span, 0, 1);
        scrubValue += (target - scrubValue) * FOLLOW;
        if (Math.abs(target - scrubValue) < EPSILON) scrubValue = target;

        const rounded = Math.round(scrubValue * 1000) / 1000;
        if (rounded !== writtenScrub) {
          writtenScrub = rounded;
          scrub.element.style.setProperty('--rail-progress', rounded.toFixed(3));
        }
      }

      /*
       * The tail. It keeps the loop alive only while something is still converging, and only inside
       * the ceiling — so a value that refuses to settle costs 900ms once, never a frame at rest.
       */
      const settled = Math.abs(target - scrubValue) < EPSILON && energy === 0;
      if (!settled && now < deadline) schedule();
    }

    function schedule() {
      if (frame === 0) frame = requestAnimationFrame(paint);
    }

    function invalidate() {
      stale = true;
      schedule();
    }

    function endEntrance() {
      window.clearTimeout(entrance);
      root.removeAttribute(ENTRANCE_ATTRIBUTE);
    }

    function onScroll() {
      // The opening draw is an arrival, not a thing to sit through: the first scroll ends it and
      // the line follows the reader from that moment on.
      if (root.hasAttribute(ENTRANCE_ATTRIBUTE)) endEntrance();
      deadline = performance.now() + TAIL_CEILING_MS;
      schedule();
    }

    geometry = measure(true);
    if (geometry.segments.length === 0) return;

    lastScrollY = window.scrollY;

    root.setAttribute(READY_ATTRIBUTE, 'on');
    if (!reduced.matches) {
      root.setAttribute(ENTRANCE_ATTRIBUTE, '');
      entrance = window.setTimeout(endEntrance, ENTRANCE_MS);
    }

    // Painted on the next frame, never in this one: the undrawn state above has to reach the
    // compositor before the target does, or the opening draw is a jump cut.
    schedule();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', invalidate);
    reduced.addEventListener('change', invalidate);
    energetic.addEventListener('change', invalidate);

    /*
     * The document's own height, which is what a lazily loaded poster, a web font and an expanded
     * error summary all change without firing a resize. One observer, on one element.
     */
    const resized = new ResizeObserver(invalidate);
    resized.observe(document.body);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(entrance);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', invalidate);
      reduced.removeEventListener('change', invalidate);
      energetic.removeEventListener('change', invalidate);
      resized.disconnect();
      live?.canvas.removeAttribute(LIVE_ATTRIBUTE);
      geometry.scrub?.element.style.removeProperty('--rail-progress');
      root.removeAttribute(READY_ATTRIBUTE);
      root.removeAttribute(ENTRANCE_ATTRIBUTE);
    };
  }, []);

  return null;
}
