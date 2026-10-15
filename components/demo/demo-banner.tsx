import { DEMO_COPY, DEMO_SOURCE_URL } from '@/lib/demo-copy';

/**
 * The strip on top of every page of the demonstration deployment (docs/DEMO.md).
 *
 * In the document flow rather than fixed, so it never covers the public page's sticky CTA or the
 * admin header. Amber from the admin status palette, not the public gold: gold is the page's action
 * colour (VISUAL-DIRECTION.md section 3.4) and this is a notice, not an action.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="bg-status-waitlisted-soft px-4 py-2 text-center text-hint font-semibold text-status-waitlisted"
    >
      {DEMO_COPY.banner}{' '}
      <a className="underline underline-offset-2" href={DEMO_SOURCE_URL}>
        {DEMO_COPY.sourceLink}
      </a>
    </div>
  );
}
