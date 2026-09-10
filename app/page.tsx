/*
 * Phase 0 holding page. The public event page is built in Phase 5 and replaces this file
 * entirely; nothing here is design work.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-[62ch] px-5 py-16">
      <p className="text-micro-label text-sky-300 uppercase">Palestra</p>
      <h1 className="text-h2 mt-4 text-text-primary">Educação Financeira para Jovens</h1>
      <p className="text-body mt-6 text-text-secondary">
        Inscrições em breve.
      </p>
    </main>
  );
}
