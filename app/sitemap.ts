/**
 * The sitemap — PRODUCT-SPEC.md section 3.1.
 *
 * Two public URLs, because there are two: the event page and the privacy notice. The admin subtree
 * is deliberately absent.
 */
import type { MetadataRoute } from 'next';

import { client as publicEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  return [
    { url: `${origin}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
