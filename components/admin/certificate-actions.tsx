'use client';

/**
 * Handing one person their certificate link.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 4.6. The system sends no messages (D2), so the organizer does —
 * and the whole of that capability is **a link**. `wa.me` is WhatsApp's own documented click-to-chat
 * URL: no API, no credential, no vendor, no dependency. One tap opens the conversation with the
 * message already written.
 *
 * The link is a capability, so it is never auto-selected, never placed in a field that a password
 * manager might read, and never rendered as its raw token: what is on screen is the URL the
 * recipient will open, assembled on the server.
 */

import { useState } from 'react';

import { BUTTON_SECONDARY, Notice } from '@/components/admin/ui';
import { ADMIN_COPY } from '@/lib/admin/copy';

export function CertificateActions({
  url,
  firstName,
  phoneE164,
  enabled,
}: {
  url: string;
  firstName: string;
  /** E.164, which `wa.me` wants without its leading `+`. */
  phoneE164: string;
  enabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const message = ADMIN_COPY.certificates.message(firstName, url);
  const whatsapp = `https://wa.me/${phoneE164.replace(/\D/gu, '')}?text=${encodeURIComponent(message)}`;

  return (
    <section className="flex flex-col gap-2 border-t border-admin-line pt-4">
      <h3 className="text-hint font-semibold text-admin-ink">{ADMIN_COPY.certificates.title}</h3>

      {/*
        The link is shown even while the switch is off, because the organizer may well be preparing
        the messages before flipping it. What changes is the warning, not the availability.
      */}
      {!enabled ? <Notice tone="warning">{ADMIN_COPY.certificates.disabled}</Notice> : null}

      <p className="text-hint break-all text-admin-muted">{url}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              // A clipboard the browser refuses is not worth a dialog: the URL is on screen above
              // and can be selected by hand.
              setCopied(false);
            }
          }}
          className={BUTTON_SECONDARY}
        >
          {copied ? ADMIN_COPY.certificates.copied : ADMIN_COPY.certificates.copy}
        </button>

        <a
          href={whatsapp}
          target="_blank"
          // `noreferrer` as well as `noopener`: the target is a third party and has no business
          // learning which admin URL the organizer came from.
          rel="noopener noreferrer"
          className={BUTTON_SECONDARY}
        >
          {ADMIN_COPY.certificates.whatsapp}
        </a>
      </div>
    </section>
  );
}
