'use client';

/**
 * The Cloudflare Turnstile widget, rendered explicitly so its lifetime is ours to control.
 *
 * Explicit rendering (`?render=explicit`) rather than the implicit `class="cf-turnstile"` scan: the
 * form needs to *reset* the widget after a refused submission, and that needs the widget id that
 * only `turnstile.render()` returns. The script is loaded once per document and the promise is
 * shared, so a remount does not fetch it again.
 *
 * **The token reaches the server through Turnstile's own hidden input.** `response-field` defaults
 * to true, so the widget injects `<input name="cf-turnstile-response">` into its container; because
 * the container sits inside the `<form>`, the token is part of the FormData with no state of ours
 * in between. Resetting the widget clears that input, which is exactly the behaviour a single-use
 * token needs.
 *
 * Nothing here decides anything. A solved widget is not permission to register: the token is proof
 * only once `siteverify` has accepted it on the server, and this component cannot be persuaded —
 * by a disabled script, a patched callback or a forged input — to grant anything it does not have.
 */

import { useEffect, useRef } from 'react';

/** The public site key is public by design; only the secret key is a secret. */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  language?: string;
  size?: 'normal' | 'flexible' | 'compact';
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | undefined;

function loadTurnstileScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('turnstile-script')), { once: true });

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });

  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  /** Changing this resets the widget, because the previous token can no longer be reused. */
  challengeNonce,
  describedBy,
}: {
  siteKey: string;
  challengeNonce: number;
  describedBy?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const target = container.current;
    if (!target) return;

    let cancelled = false;

    void loadTurnstileScript().then(
      () => {
        if (cancelled || !target.isConnected || !window.turnstile) return;
        // Under React's development double-invocation the first effect has already been cleaned
        // up, so there is never more than one widget in this container.
        widgetId.current = window.turnstile.render(target, {
          sitekey: siteKey,
          theme: 'dark',
          // Cloudflare's own language tags are lower case; `pt-BR` is accepted but warns on every
          // render, and a console warning on the public page is a console warning people report.
          language: 'pt-br',
          size: 'flexible',
        });
      },
      () => {
        // The script could not load — an offline visitor, or a blocked third party. Nothing is
        // announced here: the submission will be refused server-side with the anti-abuse message,
        // which is the same sentence and one place instead of two.
      },
    );

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    // Nonce 0 is the first render, which has nothing to reset.
    if (challengeNonce === 0) return;
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [challengeNonce]);

  return (
    // Reserved height from first paint (VISUAL-DIRECTION.md section 9.6): a widget that appears
    // after hydration and pushes the submit button down is a layout shift on the most important
    // element of the page.
    <div
      ref={container}
      aria-describedby={describedBy}
      className="min-h-[70px] w-full max-w-[300px]"
      data-testid="turnstile"
    />
  );
}
