/**
 * The admin's route-level skeleton.
 *
 * Its dimensions match the real layout — a header line, a panel of three numbers, a meter, and a
 * list — because a skeleton that does not is a spinner that also causes layout shift. Nothing here
 * animates beyond a single opacity pulse: the admin has no entrance choreography
 * (VISUAL-DIRECTION.md section 12).
 */
export default function AdminLoading() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-64 max-w-full rounded-[var(--radius-admin-control)] bg-admin-line" />
        <div className="h-4 w-80 max-w-full rounded-[var(--radius-admin-control)] bg-admin-line" />
      </div>

      <div className="rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface p-5">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((column) => (
            <div key={column} className="flex flex-col gap-2">
              <div className="h-9 w-16 rounded-[var(--radius-admin-control)] bg-admin-line" />
              <div className="h-4 w-24 rounded-[var(--radius-admin-control)] bg-admin-line" />
            </div>
          ))}
        </div>
        <div className="mt-5 h-3 w-full rounded-[var(--radius-admin-control)] bg-admin-line" />
      </div>

      <div className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface">
        {/* Eight rows at the real 40px height, so the table does not jump when it arrives. */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="flex h-10 items-center gap-4 px-3">
            <div className="h-4 flex-1 rounded-[var(--radius-admin-control)] bg-admin-line" />
            <div className="h-4 w-24 rounded-[var(--radius-admin-control)] bg-admin-line" />
          </div>
        ))}
      </div>

      <p className="sr-only" role="status">
        Carregando…
      </p>
    </div>
  );
}
