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
 *   * reduced motion delivers the whole page immediately, with the chart drawn;
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

    // Sections below the fold are readable without having been scrolled to.
    await expect(page.locator('#detalhes-titulo')).toHaveCSS('opacity', '1');

    // Interaction feedback is kept, not stripped: only choreography goes.
    const settle = await page
      .locator('#hero-cta')
      .evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(settle).not.toBe('none');
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
