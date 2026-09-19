/**
 * `robots.txt` — PRODUCT-SPEC.md section 3.1.
 *
 * The public page is meant to be found and shared; `/admin` is not. Disallowing it is a hint to
 * well-behaved crawlers and nothing more — the actual boundary is `requireAdmin()` and RLS
 * (ARCHITECTURE.md section 7). A `robots.txt` entry has never kept anyone out of anything.
 */
import type { MetadataRoute } from 'next';

import { client as publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const origin = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  return {
    /*
     * `/certificado` carries one named person's document, reachable only by an unguessable token.
     * Indexing it would take a link that was sent to one person and publish it — the page also sets
     * `robots: { index: false }` in its own metadata, which is the part a crawler actually honours.
     */
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/auth', '/certificado'] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
