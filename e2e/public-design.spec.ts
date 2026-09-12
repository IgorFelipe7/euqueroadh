/**
 * What Phase 5 is allowed to claim about the public page.
 *
 * Deliberately **not** a screenshot suite. Visual quality was reviewed by looking at renders at
 * every specified viewport; pinning pixels here would produce a test that fails on a font-hinting
 * change and passes on a broken hierarchy. What is asserted instead is the small set of properties
 * that are easy to regress silently and expensive to notice:
 *
 *   * the document never grows wider than the viewport, at any specified width;
 *   * the sticky CTA is a mobile affordance that yields to the form;
 *   * reduced motion delivers the whole page immediately, with both the chart and the journey drawn;
 *   * the Financial Journey Line (VISUAL-DIRECTION.md section 10.8) is decorative in the way that
 *     word has to mean here — silent to assistive technology, untouchable by a pointer — and it
 *     rebuilds its geometry rather than keeping a stale shape after a resize;
 *   * the counting rail (section 7.4) keeps the two proportions its composition rests on — its base
 *     one rail gap above that line, and every bead clear of the date lockup — at every desktop
 *     width, and is absent below `lg` rather than shrunk into the type;
 *   * nothing is hidden behind JavaScript;
 *   * pressing submit does not move the submit button out from under the pointer.
 *
 * **This file never changes the event's state** beyond setting it open with seats, and it submits
 * nothing. It runs before `public-registration.spec.ts` alphabetically and hands the ISR cache on in
 * the state that suite expects to start from.
 */
import { expect, test, type Page } from '@playwright/test';

import { resetActiveEvent } from './support/database';

const OPEN = { capacity: 50, waitlistEnabled: false, state: 'open' } as const;

/** Every width named in IMPLEMENTATION-PLAN.md Phase 5, plus the two smallest real phones. */
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

async function overflows(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.scrollingElement!.scrollWidth > document.documentElement.clientWidth,
  );
}

test.beforeAll(async () => {
  await resetActiveEvent(OPEN);
});

test.describe('the document never exceeds the viewport', () => {
  test('at any specified width, on both public routes', async ({ page }) => {
    for (const route of ['/', '/privacidade']) {
      await page.goto(route);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        // The hero's display type and date lockup are meant to be cut by the frame; `overflow: clip`
        // is what keeps that from becoming a scrollbar.
        await expect
          .poll(() => overflows(page), { message: `${route} overflows at ${width}px` })
          .toBe(false);

        // And once the whole page has been scrolled, so a lower section cannot be the offender.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect
          .poll(() => overflows(page), { message: `${route} overflows at ${width}px after scroll` })
          .toBe(false);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
  });
});

test.describe('the sticky call to action', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('appears after the hero, yields to the form, and never covers a field', async ({ page }) => {
    await page.goto('/');

    const bar = page.locator('[data-shown]');
    const heroCta = page.locator('#hero-cta');

    // On arrival the hero's own CTA is on screen, so the bar has no reason to exist.
    await expect(heroCta).toBeVisible();
    await expect(bar).toBeHidden();

    // Mid-page, with the hero gone and the form not yet reached.
    await page.locator('#detalhes-titulo').scrollIntoViewIfNeeded();
    await expect(bar).toBeVisible();

    // The bar must sit inside the viewport rather than hanging below the safe area.
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);

    // At the form it withdraws, so it can never sit over a field, a message or a focus ring.
    await page.locator('#inscricao').scrollIntoViewIfNeeded();
    await expect(bar).toBeHidden();

    // The height it would occupy is reserved as scroll padding (WCAG 2.2 SC 2.4.11), so a field
    // scrolled into view is never left underneath it.
    const padding = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    );
    expect(padding).toBeGreaterThanOrEqual(60);
  });

  test('does not exist above the mobile breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('#detalhes-titulo').scrollIntoViewIfNeeded();

    // `display: none`, so it is out of the accessibility tree too — a desktop reader never meets a
    // second copy of the primary action.
    await expect(page.locator('[data-shown]')).toBeHidden();
  });
});

test.describe('with prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

  test('the page arrives complete, immediately, with nothing left mid-animation', async ({
    page,
  }) => {
    await page.goto('/');

    // No settling time is allowed: everything must already be at its final state.
    const faded = await page.evaluate(() =>
      [...document.querySelectorAll('main *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          // The chart motif is decoration and is *meant* to sit at 4–6% opacity.
          if (element.closest('[aria-hidden="true"]')) return false;
          return Number.parseFloat(style.opacity) < 0.99;
        })
        .map((element) => element.tagName),
    );
    expect(faded, 'content was still transparent under reduced motion').toEqual([]);

    // The chart renders fully drawn rather than frozen part-way through its one-off draw.
    const chart = await page.locator('.u-draw').evaluate((path) => {
      const style = getComputedStyle(path);
      return { dasharray: style.strokeDasharray, dashoffset: style.strokeDashoffset };
    });
    expect(chart.dasharray).toBe('none');
    expect(Number.parseFloat(chart.dashoffset)).toBe(0);

    /*
     * And so does the journey (section 10.8). Reduced motion is a different program rather than a
     * faster one: the line is present and complete from the first frame, so it is never scrubbed by
     * scroll and never caught part-drawn. A dash pattern surviving here would mean the controller
     * had attached its listener after all.
     */
    const journey = await page.locator('.u-journey-line').evaluateAll((paths) =>
      paths.map((path) => {
        const style = getComputedStyle(path);
        return {
          drawn: (path.getAttribute('d') ?? '').length > 0,
          dasharray: style.strokeDasharray,
          dashoffset: Number.parseFloat(style.strokeDashoffset),
        };
      }),
    );
    expect(journey.length).toBeGreaterThan(0);
    expect(journey.every((line) => line.drawn)).toBe(true);
    expect(journey.map((line) => line.dasharray)).toEqual(journey.map(() => 'none'));
    expect(journey.map((line) => line.dashoffset)).toEqual(journey.map(() => 0));

    // The single ring is not played quickly; it is not played at all.
    const ring = await page
      .locator('[data-journey-ring] .u-journey-dot')
      .first()
      .evaluate((dot) => getComputedStyle(dot, '::after').content);
    expect(ring).toBe('none');

    /*
     * The counting rail is present and finished too (section 7.4): no animation left running, and
     * the two bead movements already made rather than skipped — under reduced motion the controller
     * reports every cue reached, so what renders is the composition after both counts.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    const rail = await page.evaluate(() => {
      const art = document.querySelector('.u-rail-art')!;
      const running = [...document.querySelectorAll('.u-rail-frame, .u-rail-wire, .u-rail-enter')]
        .map((element) => getComputedStyle(element).animationName)
        .filter((name) => name !== 'none');
      return {
        running,
        tilted: getComputedStyle(art).transform.startsWith('matrix3d'),
        shifted: [...document.querySelectorAll('.u-rail-shift')].map(
          (element) => getComputedStyle(element).transform,
        ),
      };
    });
    expect(rail.running, 'the counting rail was still animating').toEqual([]);

    /*
     * And the head does not exist at all: there is no drawn tip to concentrate energy at, because
     * the line is simply complete. Nor does the scrub: the object stays at the pose it was drawn in.
     */
    const kinetic = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('.u-journey-head, .u-journey-tail')].map(
        (element) => getComputedStyle(element).display,
      ),
      live: document.querySelectorAll('[data-journey-live]').length,
      progress: document
        .querySelector<HTMLElement>('[data-counting-rail]')!
        .style.getPropertyValue('--rail-progress'),
      facts: getComputedStyle(document.querySelector('#detalhes-titulo')!.parentElement!).opacity,
    }));
    expect(kinetic.heads.every((display) => display === 'none')).toBe(true);
    expect(kinetic.live).toBe(0);
    expect(kinetic.progress).toBe('');
    expect(kinetic.facts, 'the facts were waiting for a line that never moves').toBe('1');
    // The static perspective is drawing, not motion, and stays.
    expect(rail.tilted).toBe(true);
    expect(rail.shifted.every((transform) => transform !== 'none')).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });

    // Sections below the fold are readable without having been scrolled to.
    await expect(page.locator('#detalhes-titulo')).toHaveCSS('opacity', '1');

    // Interaction feedback is kept, not stripped: only choreography goes.
    const settle = await page
      .locator('#hero-cta')
      .evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(settle).not.toBe('none');
  });
});

test.describe('the Financial Journey Line', () => {
  /**
   * The line is decoration, and decoration on this page has two hard obligations: it says nothing to
   * a screen reader, and it can never come between a finger and a control. The points are the risk
   * worth a test — they are absolutely positioned spans, which paint *above* their section's in-flow
   * content, so one of them left hit-testable would sit over the form.
   */
  test('says nothing, catches nothing, and focuses nothing', async ({ page }) => {
    await page.goto('/');

    const decorations = page.locator('[data-journey-segment], [data-journey-point]');
    expect(await decorations.count()).toBeGreaterThan(0);

    for (const decoration of await decorations.all()) {
      await expect(decoration).toHaveAttribute('aria-hidden', 'true');
      await expect(decoration).toHaveCSS('pointer-events', 'none');
    }

    // No focusable SVG: `focusable="false"` on every canvas, and nothing in the tab order.
    const canvases = await page.locator('[data-journey-segment]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        focusable: node.getAttribute('focusable'),
        tabindex: node.getAttribute('tabindex'),
      })),
    );
    expect(canvases.every((canvas) => canvas.focusable === 'false')).toBe(true);
    expect(canvases.every((canvas) => canvas.tabindex === null)).toBe(true);
  });

  /**
   * The geometry is measured from the page's own layout, which means a resize invalidates it. A line
   * that kept its old shape would be pinned to where the poster and the form panel used to be —
   * which is the defect this architecture is most exposed to, and therefore the one worth pinning.
   */
  test('redraws its geometry after a resize, and completes by the foot of the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const shapes = () =>
      page
        .locator('.u-journey-line')
        .evaluateAll((paths) => paths.map((path) => path.getAttribute('d') ?? ''));

    // Scrolled to the foot, every segment is drawn to its end: the journey resolves rather than
    // stopping somewhere in the middle of the page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() =>
        page
          .locator('.u-journey-line')
          .evaluateAll((paths) =>
            paths.every((path) => Number.parseFloat(getComputedStyle(path).strokeDashoffset) === 0),
          ),
      )
      .toBe(true);

    const wide = await shapes();
    expect(wide.every((d) => d.startsWith('M'))).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await shapes()).join('|') !== wide.join('|')).toBe(true);

    // And the narrow composition is a real path too, not an empty attribute left behind.
    const narrow = await shapes();
    expect(narrow.every((d) => d.startsWith('M'))).toBe(true);
  });
});

test.describe('the counting rail', () => {
  /**
   * The object's one structural claim (VISUAL-DIRECTION.md section 7.4): its base rail sits exactly
   * one rail gap above the journey line's run through the hero, so the line reads as the rail the
   * composition is missing and the date as the value counted onto it.
   *
   * That relationship is arithmetic in the stylesheet — `19%` of the header, plus 19% of the
   * lockup's own box, plus a tenth of the object's width — and it is the first thing that breaks
   * when the lockup is resized or the object is moved. Measured here at every desktop width rather
   * than asserted once, because it is a proportion and not a number.
   */
  test('stands one rail gap above the journey line, at every desktop width', async ({ page }) => {
    await page.goto('/');

    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });

      const measured = await page.evaluate(() => {
        const rail = document.querySelector('[data-counting-rail]')!.getBoundingClientRect();
        // The first node down the page is the hero's: the date lockup's own baseline.
        const node = document.querySelector('[data-journey-node]')!.getBoundingClientRect();
        return { gap: node.top + node.height / 2 - rail.bottom, width: rail.width };
      });

      // One rail gap is 90 of the drawing's 900 units — a tenth of whatever the object is wide.
      expect(Math.abs(measured.gap - measured.width * 0.1), `gap is wrong at ${width}px`).toBeLessThan(2);
    }
  });

  /**
   * The second claim, and the reason the base rail carries no beads at all: the `19SET` lockup
   * reaches up into that row, and a bead printed half-behind a glyph reads as a mistake. The gold
   * bead one rail above it is the closest thing to the date and has to stay clear of it.
   */
  test('never puts a bead behind the date lockup', async ({ page }) => {
    await page.goto('/');

    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });

      const clearance = await page.evaluate(() => {
        const beads = [...document.querySelectorAll('.u-rail-bead, .u-rail-bead-gold')].map((bead) =>
          bead.getBoundingClientRect(),
        );
        const lockup = document.querySelector('.u-date-lockup')!.getBoundingClientRect();
        // Only the beads low enough to meet the lockup's cap height can collide with it.
        const low = beads.filter((bead) => bead.bottom > lockup.top);
        return low.length === 0 ? Infinity : Math.min(...low.map((bead) => lockup.left - bead.right));
      });

      expect(clearance, `a bead reaches the lockup at ${width}px`).toBeGreaterThan(0);
    }
  });

  test('is decorative, silent and untouchable, and does not exist below lg', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const svg = page.locator('.u-rail-art');
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    await expect(svg).toHaveAttribute('focusable', 'false');
    await expect(svg).toHaveCSS('pointer-events', 'none');

    // It says nothing: no text, and therefore nothing in the accessibility tree to hear.
    expect(await svg.evaluate((element) => element.textContent?.trim() ?? '')).toBe('');

    /*
     * Below `lg` the hero has no right-hand region and the object is not rendered — `display: none`,
     * so its two journey cues take themselves out of the controller's measurement as well. A cue
     * left in a hidden subtree would be measured at the origin and fire on the first frame.
     *
     * Loaded at that width rather than resized into it: the question is what a phone-sized visit
     * does, and an attribute left behind by a wider layout says nothing about it either way.
     */
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('[data-counting-rail]')).toBeHidden();

    // Its own two cues, not the page's — Detalhes and Inscrição have cues of their own at every
    // width, and they are supposed to be measured.
    const cues = await page
      .locator("[data-journey-cue='a'], [data-journey-cue='b']")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-reached')));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues, 'a cue was measured inside a hidden subtree').toEqual(cues.map(() => null));
  });
});

test.describe('the choreography', () => {
  /**
   * The fusion (VISUAL-DIRECTION.md section 7.4): the line becomes collinear with the rail carrying
   * the second gold bead, briefly, and then leaves.
   *
   * Two properties are worth pinning and neither is a pixel: the run is *level with that rail* — the
   * whole point, and the thing a change of typography used to break — and it is *short*, because a
   * line that becomes the whole rail stops being a coincidence and starts being a replacement.
   */
  test('merges with one rail of the object, briefly, at every desktop width', async ({ page }) => {
    await page.goto('/');

    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });

      const fusion = await page.evaluate(() => {
        const rail = document.querySelector('[data-counting-rail]')!.getBoundingClientRect();
        // Authored order: the lead-in, then the two ends of the fused run.
        const [, from, to] = [
          ...document.querySelectorAll('[data-counting-rail] [data-journey-point]'),
        ].map((point) => point.getBoundingClientRect());
        return {
          level: Math.abs(from.top - to.top),
          // The rail it should be level with: the fourth of five, in the drawing's own proportions.
          offRail: Math.abs(from.top - (rail.top + (358 / 448) * rail.height)),
          share: (to.left - from.left) / rail.width,
        };
      });

      expect(fusion.level, `the run is not horizontal at ${width}px`).toBeLessThan(1.5);
      expect(fusion.offRail, `the run is not on the rail at ${width}px`).toBeLessThan(2.5);
      expect(fusion.share, `the run is too long at ${width}px`).toBeLessThan(0.32);
      expect(fusion.share, `the run is too short at ${width}px`).toBeGreaterThan(0.08);
    }
  });

  /**
   * The scrub (section 7.4): the hero's scroll position drives the bead groups continuously, in both
   * directions, and reverses when the reader does. Driven with a real wheel rather than
   * `scrollTo`, because the controller answers to the scroll *event* and a programmatic jump in a
   * headless browser does not always produce one.
   */
  test('scrubs the beads with the scroll, both ways, and returns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const state = () =>
      page.evaluate(() => ({
        progress: Number.parseFloat(
          document.querySelector<HTMLElement>('[data-counting-rail]')!.style.getPropertyValue(
            '--rail-progress',
          ) || '0',
        ),
        offsets: [...document.querySelectorAll('.u-rail-scrub')].map((group) => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(group).transform);
          return Math.round(matrix.m41);
        }),
      }));

    const rest = await state();
    expect(rest.progress).toBe(0);

    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, 50);
      await page.waitForTimeout(40);
    }
    await expect.poll(async () => (await state()).progress).toBeGreaterThan(0.3);

    const moved = await state();
    // A hierarchy, not a setting: some groups travel far, one of them against the others, and the
    // quietest barely move at all.
    expect(Math.max(...moved.offsets), 'no group travelled right').toBeGreaterThan(4);
    expect(Math.min(...moved.offsets), 'no group travelled left').toBeLessThan(-20);

    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(40);
    }
    // All the way back, not nearly: the convergence tail is allowed a few frames to land on zero.
    await expect.poll(async () => (await state()).progress).toBe(0);

    const returned = await state();
    expect(returned.offsets, 'the beads did not return').toEqual(rest.offsets);
  });

  /**
   * The head (section 10.9). Exactly one segment carries it — the one the drawn tip is inside — and
   * it is positioned from the stroke itself rather than from an approximation of it.
   */
  test('carries one head, on the segment being drawn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Past the opening draw, when the head is deliberately absent.
    await page.mouse.wheel(0, 40);
    await expect.poll(() => page.locator('[data-journey-live]').count()).toBe(1);

    // The head is deliberately absent during the opening draw and fades in over 320ms after it.
    await expect
      .poll(() =>
        page
          .locator('[data-journey-live] .u-journey-head')
          .evaluate((marker) => Number.parseFloat(getComputedStyle(marker).opacity)),
      )
      .toBeGreaterThan(0.9);

    const head = await page.evaluate(() => {
      const live = document.querySelector('[data-journey-live]')!;
      const marker = live.querySelector('.u-journey-head')!;
      const line = live.querySelector<SVGPathElement>('.u-journey-line')!;
      const transform = marker.getAttribute('transform') ?? '';
      const [x, y] = (/translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform) ?? []).slice(1).map(Number);
      // The point the controller placed it at has to be *on* the path it is the end of.
      let nearest = Infinity;
      for (let at = 0; at <= line.getTotalLength(); at += 4) {
        const point = line.getPointAtLength(at);
        nearest = Math.min(nearest, Math.hypot(point.x - x, point.y - y));
      }
      return { placed: Number.isFinite(x), nearest, opacity: getComputedStyle(marker).opacity };
    });

    expect(head.placed).toBe(true);
    expect(head.nearest, 'the head is not on the line').toBeLessThan(3);
  });

  /**
   * Detalhes (section 10.9): the facts resolve because the line arrived. The property that matters
   * is the additive one — the hidden state may only exist while the journey is actually running, so
   * a page without it is a page with its facts on show.
   */
  test('resolves the facts when the line reaches them, and shows them when it cannot', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const opacity = () =>
      page.locator('#detalhes-titulo').evaluate((el) => getComputedStyle(el.parentElement!).opacity);

    // Before the line gets there: held back, but only because the controller is running.
    await expect(page.locator('html')).toHaveAttribute('data-journey', 'on');
    expect(Number.parseFloat(await opacity())).toBeLessThan(0.2);

    await page.locator('#detalhes-titulo').scrollIntoViewIfNeeded();
    await expect.poll(async () => Number.parseFloat(await opacity())).toBe(1);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

  test('every fact still renders, and nothing waits on a script to become visible', async ({
    page,
  }) => {
    await page.goto('/');

    const body = page.locator('body');
    for (const fact of [
      'Educação',
      'Financeira',
      '19 de setembro de 2026',
      '19h às 21h',
      'Espaço Cezanne Eventos',
      'R. José Possidonio Silva, 435',
      'Hortolândia/SP',
      'Inscrições gratuitas',
      'Coffee break incluso',
    ]) {
      await expect(body, `"${fact}" is missing without JavaScript`).toContainText(fact);
    }

    // The reveal is additive: its initial state exists only under a class JavaScript adds, so a
    // failed bundle can never leave a section invisible.
    await expect(page.locator('html')).not.toHaveClass(/js-reveal/);
    await expect(page.locator('#detalhes-titulo')).toBeVisible();
    await expect(page.locator('#apoio-titulo')).toBeAttached();

    // And the disclosed trade-off is disclosed. Read through the element's own content rather
    // than through `innerText`: how a browser exposes `<noscript>` to the accessibility tree
    // differs, but the sentence being *in the document* is the property that matters.
    const noscript = page.locator('#inscricao noscript');
    await expect(noscript).toHaveCount(1);
    expect(await noscript.innerHTML()).toContain(
      'Para se inscrever, ative o JavaScript no seu navegador.',
    );
  });
});

test.describe('the submit button', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * A regression guard for a defect found by measuring rather than by reading.
   *
   * Pressing the button blurs the field above it. If blur validation inserts that field's error
   * message at that moment, the button moves down by about 50px **between `pointerdown` and
   * `pointerup`** — the pointer comes up somewhere else, no click is generated, and the form is
   * never submitted. The person taps "Confirmar inscrição", nothing appears to happen, and no error
   * summary is announced. On a phone that is a lost registration.
   */
  test('does not move out from under the pointer when the last field is invalid', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#inscricao').scrollIntoViewIfNeeded();

    await page.getByLabel('Nome completo').fill('A');
    await page.getByLabel('Idade').fill('0');
    // Left focused and invalid, exactly as someone who finishes typing and reaches for the button.
    await page.getByLabel('Celular').fill('1933456789');

    const button = page.getByRole('button', { name: 'Confirmar inscrição' });
    const before = (await button.boundingBox())!;
    const point = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();

    /*
     * The property that actually matters: the point the pointer went down on is still the button
     * when it comes up. Asserted by hit-testing rather than by comparing coordinates, because the
     * press transform legitimately moves the box by a fraction of a pixel and a numeric threshold
     * would be measuring the animation instead of the defect.
     */
    const stillOnButton = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button[type="submit"]') !== null,
      point,
    );
    expect(stillOnButton, 'the button moved out from under the pointer').toBe(true);

    await page.mouse.up();

    // The press landed: every field is reported at once, above the fieldset, and focused.
    const summary = page.getByTestId('registration-alert');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Verifique estes campos');
    await expect(summary).toContainText('Informe seu nome completo.');
    await expect(summary).toContainText('Informe uma idade válida.');
    await expect(summary).toContainText('Esse número parece ser um telefone fixo.');
    await expect(summary).toBeFocused();
  });
});

test.describe('the page structure', () => {
  test('has one main landmark, one h1, and headings in order', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);

    // The accessible name of the single h1 is the event's name, assembled from the lockup's spans.
    await expect(page.locator('h1')).toHaveText(/Palestra\s*Educação\s*Financeira\s*para jovens/);

    // No h3 appears before the first h2.
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('h1, h2, h3')].map((element) => element.tagName),
    );
    expect(order[0]).toBe('H1');
    expect(order.indexOf('H2')).toBeLessThan(order.indexOf('H3') === -1 ? Infinity : order.indexOf('H3'));
  });

  test('the decorative date lockup is hidden from assistive technology', async ({ page }) => {
    await page.goto('/');

    // It is a fragment ("19 SET"); the real date is the meta line and the <dl>, in full sentences.
    const lockups = page.locator('.u-date-lockup');
    expect(await lockups.count()).toBeGreaterThan(0);
    for (const lockup of await lockups.all()) {
      await expect(lockup).toHaveAttribute('aria-hidden', 'true');
    }

    await expect(page.locator('#detalhes-titulo')).toBeAttached();
    await expect(page.locator('main')).toContainText('19 de setembro de 2026');
  });
});


/* ================================================================================================
 * The footer credit, and the finalised privacy notice
 * ============================================================================================== */

test.describe('the footer credit', () => {
  test('sits at the absolute bottom, links to GitHub, and opens safely', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).toContainText('Desenvolvido por');
    await expect(footer).toContainText('Igor Felipe');

    const github = footer.getByRole('link', { name: /Perfil de Igor Felipe no GitHub/ });

    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('href', 'https://github.com/IgorFelipe7');
    await expect(github).toHaveAttribute('target', '_blank');
    // `noopener` is the security half: without it the opened tab gets a handle on this one.
    await expect(github).toHaveAttribute('rel', /noopener/);
    await expect(github).toHaveAttribute('rel', /noreferrer/);
    await expect(github).toHaveText(/GitHub/);

    // Last in the document: nothing of the organizers' or the event's belongs below it.
    const creditIsLast = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('footer a')];
      const credit = anchors.find((node) =>
        node.getAttribute('href')?.includes('github.com'),
      );
      return credit ? anchors.indexOf(credit) === anchors.length - 1 : false;
    });
    expect(creditIsLast, 'the credit is the last thing in the footer').toBe(true);

    /*
     * One anchor, not two. The name and the `GitHub` affordance are a single link, so a keyboard
     * user meets one stop here — and the underline under the name is that link's own affordance
     * rather than a decoration sitting beside a different target.
     */
    // Two links in the whole footer: the privacy notice, and this one.
    await expect(footer.getByRole('link')).toHaveCount(2);
    expect(await github.innerText()).toMatch(/Igor Felipe[\s\S]*GitHub/);

    // The GitHub mark is decorative: the anchor's own aria-label carries the real name.
    const mark = github.locator('svg');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('aria-hidden', 'true');

    // It carries no second personal detail, and no e-mail address.
    await expect(footer).not.toContainText('@');
  });

  test('is legible and does not overflow at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const github = page.getByRole('link', { name: /Perfil de Igor Felipe no GitHub/ });
    await github.scrollIntoViewIfNeeded();

    const box = await github.boundingBox();
    expect(box).not.toBeNull();
    // The 24px floor of WCAG 2.2 SC 2.5.8, at the size a thumb actually meets it.
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    // The public page never scrolls sideways, credit included.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('is not repeated in the admin area', async ({ page }) => {
    await page.goto('/admin/entrar');
    await expect(page.getByText('Desenvolvido por')).toHaveCount(0);
    await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
  });

  /**
   * The `sky-300` rule under the name draws itself on hover and focus. It is the page's one piece of
   * motion below the fold, and it echoes the Financial Journey Line deliberately — so it is worth a
   * test that it actually moves, and that the permanent hairline beneath it is there at rest so the
   * link is never identified by colour alone (SC 1.4.1).
   */
  test('the rule under the name draws itself, over a hairline that is always there', async ({
    page,
  }) => {
    await page.goto('/');

    const name = page.locator('.u-credit-underline');
    await expect(name).toHaveCount(1);
    await name.scrollIntoViewIfNeeded();

    const scaleOf = (pseudo: '::before' | '::after') =>
      page.evaluate((selector) => {
        const element = document.querySelector('.u-credit-underline');
        if (!element) return null;
        const style = getComputedStyle(element, selector);
        return { transform: style.transform, height: style.height, colour: style.backgroundColor };
      }, pseudo);

    // At rest: the hairline is drawn at full width, the sky rule is collapsed.
    const hairline = await scaleOf('::before');
    expect(hairline?.height).toBe('1px');
    expect(hairline?.colour).not.toBe('rgba(0, 0, 0, 0)');

    const atRest = await scaleOf('::after');
    expect(atRest?.transform).toMatch(/matrix\(0,/);

    // On hover it spans the name.
    await page.getByRole('link', { name: /Perfil de Igor Felipe no GitHub/ }).hover();
    await page.waitForTimeout(600);

    const hovered = await scaleOf('::after');
    expect(hovered?.transform).toMatch(/matrix\(1,/);
  });

  test('with prefers-reduced-motion the rule arrives without travelling', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await page.goto('/');
      const transition = await page.evaluate(() => {
        const element = document.querySelector('.u-credit-underline');
        return element ? getComputedStyle(element, '::after').transitionDuration : null;
      });

      // No sweep. The end state is still reached on hover; it is simply not animated to.
      expect(transition).toMatch(/^0s/);
    } finally {
      await context.close();
    }
  });
});

test.describe('the privacy notice', () => {
  /**
   * The page used to publish its own open questions. It no longer may: it is linked from the
   * registration form, it is indexed, and "this page is not complete" is not something a
   * participant deciding whether to hand over a telephone number can act on.
   */
  test('states no pending or incomplete information', async ({ page }) => {
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { name: 'Privacidade', level: 1 })).toBeVisible();

    const text = (await page.locator('main').innerText()).toLowerCase();

    for (const phrase of [
      'ainda não está completa',
      'ainda não foram publicadas',
      'não está completa',
      'a definir',
      'a ser definido',
      'pendente',
      'em breve',
    ]) {
      expect(text, `the notice must not say "${phrase}"`).not.toContain(phrase);
    }
  });

  test('carries every required section, the contact channel and the retention period', async ({
    page,
  }) => {
    await page.goto('/privacidade');

    for (const heading of [
      'Quem organiza o evento',
      'Quais dados coletamos',
      'Para que usamos seus dados',
      'Com quem os dados podem ser compartilhados',
      'Adolescentes',
      'Por quanto tempo guardamos os dados',
      'Seus direitos',
      'Segurança',
      'Atualizações deste aviso',
    ]) {
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    }

    const main = page.locator('main');

    // The three organizers, named as the banner names them.
    await expect(main).toContainText('Marcados pela Graça');
    await expect(main).toContainText('Ministério Teen');
    await expect(main).toContainText('Assembleia de Deus Ministério do Belém em Hortolândia');

    await expect(main).toContainText('12 anos ou mais');
    await expect(main).toContainText('até 30 dias após a realização do evento');
    await expect(main).toContainText('Última atualização: 12 de setembro de 2026.');
    await expect(main).toContainText(
      'Não vendemos os dados dos participantes e não utilizamos os dados da inscrição para publicidade ou marketing.',
    );

    // The contact channel is a real mailto, in every place that promises one.
    const mails = main.getByRole('link', { name: 'contato@euqueroadh.com' });
    expect(await mails.count()).toBeGreaterThanOrEqual(3);
    await expect(mails.first()).toHaveAttribute('href', 'mailto:contato@euqueroadh.com');
  });

  /**
   * Nothing the repository does not know may appear here: a fabricated CNPJ or address reads
   * exactly like a real one, and nobody would come back to check.
   */
  test('invents no legal identity, and claims nothing untrue', async ({ page }) => {
    await page.goto('/privacidade');
    const text = await page.locator('main').innerText();

    expect(text).not.toMatch(/CNPJ/i);
    expect(text).not.toMatch(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
    // No telephone number, and no street address invented for the organization.
    expect(text).not.toMatch(/\(\d{2}\)\s?\d{4,5}-\d{4}/);
    // No claim the product cannot keep.
    expect(text.toLowerCase()).not.toContain('cookies de');
    expect(text.toLowerCase()).not.toContain('google analytics');
    expect(text.toLowerCase()).not.toContain('totalmente seguro');
    // No guardian field and no consent checkbox is offered anywhere.
    expect(text.toLowerCase()).not.toContain('autorização do responsável');
  });
});
