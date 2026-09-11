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
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/auth'] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
