import type { Metadata } from 'next';
import Link from 'next/link';

import { CTA_PRIMARY, CTA_SECONDARY, CTA_TERTIARY } from '@/components/site/cta';
import { Grain } from '@/components/site/grain';
import { getCertificate } from '@/lib/data/public';
import { presentCertificate } from '@/lib/domain/certificate';
import { certificatePath } from '@/lib/routes';

/**
 * `/certificado/<token>` — one person's certificate.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 4. The token is an unguessable capability, and there is no
 * lookup by telephone number anywhere in the product: a page that answers "what is the name
 * registered to this number" is a personal-data disclosure endpoint with a form in front of it, and
 * a rate limit reduces the volume of that disclosure rather than changing what it is.
 *
 * **Every negative case renders the same sentence** — unknown token, cancelled registration, absent
 * on the night, switch not yet flipped. The routine behind it returns zero rows for all four, so
 * this page cannot be used to tell them apart.
 *
 * The composition is the same one the downloadable images carry, rendered as real HTML: selectable,
 * announced, and printable to a vector PDF through the browser's own dialog, which is why no PDF
 * dependency exists.
 */

export const dynamic = 'force-dynamic';

/**
 * Never indexed, and never followed.
 *
 * The generic title is deliberate: a browser tab, a shared screenshot and a history entry would
 * otherwise carry the recipient's name to anyone standing behind them.
 */
export const metadata: Metadata = {
  title: 'Certificado',
  robots: { index: false, follow: false },
};

function Unavailable() {
  return (
    <main className="u-shell flex min-h-dvh max-w-[60ch] flex-col justify-center gap-6 py-16">
      <h1 className="text-h2 text-text-primary">Certificado não disponível</h1>
      <p className="text-body text-text-secondary">
        Este link não corresponde a um certificado disponível. Os certificados ficam disponíveis
        após o evento, para quem esteve presente.
      </p>
      <p className="text-body text-text-secondary">
        Se você participou e recebeu este link da organização, fale com quem o enviou.
      </p>
      <p>
        <Link href="/" className={CTA_TERTIARY}>
          ← Palestra — Educação Financeira para Jovens
        </Link>
      </p>
    </main>
  );
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const certificate = await getCertificate(decodeURIComponent(token));

  if (!certificate) return <Unavailable />;

  const view = presentCertificate(certificate);
  const base = certificatePath(token);

  return (
    <>
      <Grain />

      <main className="u-shell flex flex-col gap-10 py-12 lg:py-20">
        <header className="flex flex-col gap-2">
          <p className="text-body text-text-secondary">
            Parabéns, {view.firstName}. Seu certificado está pronto.
          </p>
        </header>

        {/*
          The certificate itself, as an article rather than as a picture of one: the text is real
          text, so it is selectable, searchable, announced by a screen reader, and printed as vector
          type by the browser rather than as a bitmap.
        */}
        <article
          aria-label="Certificado de participação"
          className="u-certificate relative flex flex-col justify-between gap-10 overflow-hidden rounded-[var(--radius-panel)] bg-ink-800 px-6 py-10 sm:px-10 sm:py-14"
        >
          <div className="u-glow" aria-hidden="true" />

          <div className="relative flex items-center gap-3">
            {/* The one gold mark on the document. */}
            <span aria-hidden="true" className="h-6 w-[3px] shrink-0 bg-gold-400" />
            <p className="text-kicker uppercase text-sky-300">{view.kicker}</p>
          </div>

          <div className="relative flex flex-col gap-5">
            {/*
              The identity's weight jump applied to the recipient — the given name at 300, the rest
              at 800, exactly as the banner sets `educação` against `Financeira`.
            */}
            <h1 className="text-[clamp(2rem,7vw,4.5rem)] leading-[1.02] tracking-[-0.03em] text-text-primary">
              <span className="font-light">{view.given}</span>
              {view.family ? <span className="font-extrabold"> {view.family}</span> : null}
            </h1>

            {/*
              The chart is the rule under the name: the event's subject, the identity's signature,
              and the structural line a certificate needs, at once.
            */}
            <svg
              viewBox="0 0 1000 55"
              className="h-8 w-full max-w-[44rem]"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M0 47 L104 39 L182 44 L288 25 L378 34 L472 16 L560 27 L668 9 L760 20 L856 5 L1000 13"
                stroke="var(--color-sky-300)"
                strokeWidth="3"
                strokeLinejoin="round"
                opacity="0.5"
              />
            </svg>

            <p className="text-body max-w-[62ch] text-text-secondary">{view.statement}</p>
          </div>

          <div className="relative flex flex-col gap-5">
            <div className="flex flex-col gap-4 rounded-[var(--radius-field)] bg-blue-500 px-5 py-5 sm:flex-row sm:justify-between">
              <div className="flex flex-col gap-2">
                <p className="text-kicker uppercase text-[#BBD3F5]">Realização</p>
                <ul className="flex flex-col gap-0.5 text-[0.9375rem] font-bold text-text-primary">
                  <li>Marcados pela Graça</li>
                  <li>Ministério Teen</li>
                  <li>Assembleia de Deus — Belém</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-kicker uppercase text-[#BBD3F5]">Apoio</p>
                <ul className="text-[0.9375rem] font-bold text-text-primary">
                  <li>Sicredi</li>
                </ul>
              </div>
            </div>

            <p className="text-hint text-text-muted">
              {view.dateLabel}
              {view.timeLabel ? ` · ${view.timeLabel}` : ''}
            </p>
          </div>
        </article>

        {/*
          The actions. PNG first, because on a phone that is one tap to the gallery and one more to
          WhatsApp; printing is the secondary path and produces a real vector PDF.

          `download` on a same-origin link is what makes the browser save rather than navigate.
        */}
        <div className="u-no-print flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <a href={`${base}/imagem`} download={`${view.fileName}.png`} className={CTA_PRIMARY}>
              Baixar certificado
            </a>
            <a
              href={`${base}/story`}
              download={`${view.fileName}-story.png`}
              className={CTA_SECONDARY}
            >
              Versão para story
            </a>
          </div>
          <p className="text-hint text-text-muted">
            Para um PDF, use a opção de imprimir do seu navegador e escolha «Salvar como PDF».
          </p>
        </div>

        <p className="u-no-print text-hint text-text-muted">
          Este link é pessoal. Ele dá acesso ao seu certificado — evite publicá-lo.
        </p>

        <p className="u-no-print">
          <Link href="/" className={CTA_TERTIARY}>
            ← Palestra — Educação Financeira para Jovens
          </Link>
        </p>
      </main>
    </>
  );
}
