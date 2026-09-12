/**
 * The admin subtree's shell.
 *
 * Two decisions live here, and both are structural rather than cosmetic:
 *
 * **`force-dynamic`.** Every admin response depends on who is asking, and the per-request CSP nonce
 * from `proxy.ts` cannot exist in a prerendered page. Rendering dynamically is what makes both true
 * (ARCHITECTURE.md section 4). It applies to the sign-in page too: that page reads query parameters
 * and must never be served from a cache that also served someone else's.
 *
 * **Light scheme.** The public page is dark and carries the event's identity; the admin is a tool
 * used for long stretches, sometimes in daylight at a venue door, sometimes printed (D12). The
 * `data-admin` attribute is what selects the light palette, the readable focus ring and the
 * scroll margins in `globals.css` — scoped to this subtree, so the two surfaces cannot drift into
 * each other. The chrome itself (sidebar, tab bar) belongs to the protected layout, because the
 * sign-in page has no navigation.
 */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-admin className="min-h-dvh bg-admin-field text-admin-ink">
      {children}
    </div>
  );
}
