/**
 * `robots.txt` — PRODUCT-SPEC.md section 3.1.
 *
 * The public page is meant to be found and shared; `/admin` is not. Disallowing it is a hint to
 * well-behaved crawlers and nothing more — the actual boundary is `requireAdmin()` and RLS
 * (ARCHITECTURE.md section 7). A `robots.txt` entry has never kept anyone out of anything.
 */
import type { MetadataRoute } from 'next';

import { demo, client as publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const origin = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  // The demonstration deployment is a copy of the real page with fictitious data: nothing in it is
  // meant to be found by search (docs/DEMO.md).
  if (demo.enabled) return { rules: { userAgent: '*', disallow: '/' } };

  return {
    /*
     * `/certificado` carries one named person's document, reachable only by an unguessable token.
     * Indexing it would take a link that was sent to one person and publish it. `/certificado` itself
     * is now also the public retrieval portal: it carries no capability and is meant to be shared, but
     * it is still an identification form over personal data, and a search result for it would be an
     * invitation to probe rather than a service to anybody — the organizer hands the address out
     * directly. `/presenca` is a live check-in capability and must never be crawled at all.
     *
     * Each of those pages also sets `robots: { index: false }` in its own metadata and carries an
     * `X-Robots-Tag` header, which are the parts a crawler actually honours; this file is the hint.
     */
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/auth', '/certificado', '/presenca'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
