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
 * used for long stretches, sometimes in daylight at a venue door, sometimes printed (D12). The full
 * admin chrome — sidebar, tab bar, the four destinations — is Phase 6; this is the minimum that
 * makes the sign-in and the protected placeholder legible.
 */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh bg-white text-ink-900"
      style={{ colorScheme: 'light', backgroundColor: '#f6f7fb' }}
    >
      {children}
    </div>
  );
}
