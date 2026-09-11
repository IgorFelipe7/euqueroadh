/**
 * `/privacidade` — PRODUCT-SPEC.md section 12, IMPLEMENTATION-PLAN.md Phase 5.
 *
 * **This page is deliberately incomplete, and says so on its face.**
 *
 * Three facts a privacy notice must carry are not yet known: which of the three `REALIZAÇÃO`
 * entities is the data controller (Q2), what channel a participant uses to exercise their rights
 * (Q3), and how long registration data is kept after the event (Q4). DECISIONS.md records a
 * recommended default for each and marks all three as **blocking launch**.
 *
 * Inventing them would be the worst possible outcome: a fabricated controller and a fabricated
 * retention period read exactly like real ones, and nobody would ever come back to check. So this
 * page publishes only what the specification actually supports — what is collected, why, who can
 * see it, and what is never done with it — and states the three open items in the open, as a
 * visible notice rather than as a code comment.
 *
 * Acceptance criterion 28 is the gate: the notice is not launch-ready until Q2–Q4 have real
 * answers. When they arrive, the notice at the top of the page is replaced by the three facts and
 * `robots.index` is turned back on — an edit to this file and nothing else.
 *
 * Static. Nothing here depends on a request or on the database.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { Grain } from '@/components/site/grain';
import { CTA_TERTIARY } from '@/components/site/cta';

export const metadata: Metadata = {
  title: 'Como usamos seus dados',
  description:
    'O que a inscrição na Palestra — Educação Financeira para Jovens coleta, por que coleta e ' +
    'quem tem acesso.',
  alternates: { canonical: '/privacidade' },
  // A notice that is still missing its controller and its retention period should not be indexed
  // as if it were final.
  robots: { index: false, follow: true },
};

export default function PrivacyNotice() {
  return (
    <>
      <main className="u-shell flex max-w-[68ch] flex-col gap-10 py-16 lg:py-24">
        <header className="flex flex-col gap-4">
          {/* The way back, at the top where someone who arrived from the form will look for it. */}
          <p className="text-hint">
            <Link href="/" className={CTA_TERTIARY}>
              ← Palestra — Educação Financeira para jovens
            </Link>
          </p>

          <p className="text-micro-label mt-2 text-sky-300 uppercase">Privacidade</p>
          <h1 className="text-h2 font-stretch-[105%] text-text-primary">
            Como usamos seus dados
          </h1>
          <p className="text-body text-text-secondary">
            Esta página explica o que a inscrição nesta palestra coleta e o que é feito com isso.
          </p>
        </header>

        {/*
          The open items, stated plainly. `role="note"` rather than `alert`: it is context for the
          reader, not an interruption.
        */}
        <section
          aria-labelledby="pendencias-titulo"
          role="note"
          className="rounded-panel border border-sky-300/50 bg-ink-800 p-6"
        >
          <h2 id="pendencias-titulo" className="text-h3 text-text-primary">
            Esta página ainda não está completa
          </h2>
          <p className="text-body mt-3 text-text-secondary">
            Três informações dependem de uma definição da organização e ainda não foram publicadas:
          </p>
          <ul className="text-body mt-3 flex list-disc flex-col gap-2 pl-5 text-text-secondary">
            <li>qual das organizações responde legalmente pelos dados;</li>
            <li>o canal de contato para pedir correção ou exclusão dos seus dados;</li>
            <li>por quanto tempo os dados são guardados depois do evento.</li>
          </ul>
          <p className="text-body mt-3 text-text-secondary">
            Enquanto isso não for definido e publicado aqui, as inscrições permanecem encerradas.
          </p>
        </section>

        <Article title="O que é coletado" id="coleta">
          <p>Três informações, e nenhuma outra:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>seu nome;</li>
            <li>sua idade;</li>
            <li>seu número de celular.</li>
          </ul>
          <p>
            Não pedimos e-mail, CPF, data de nascimento, endereço nem qualquer outro dado. Não há
            cadastro, não há senha e não existe conta de participante.
          </p>
        </Article>

        <Article title="Para que servem" id="finalidade">
          <p>
            Para organizar esta palestra: controlar as vagas, montar a lista de presença e entrar em
            contato com você pelo celular informado caso algo mude — por exemplo, se uma vaga da
            lista de espera for liberada.
          </p>
          <p>
            O número de celular também é o que identifica uma inscrição. É por ele que o sistema
            reconhece quem já está inscrito e evita inscrições duplicadas.
          </p>
        </Article>

        <Article title="Quem tem acesso" id="acesso">
          <p>
            Apenas os organizadores autorizados, cada um com sua própria conta. A lista de inscritos
            nunca é pública: não existe contador de inscrições, lista de nomes nem seção “quem vai”
            em nenhuma página deste site.
          </p>
          <p>
            Toda ação de um organizador sobre os seus dados — corrigir, cancelar, promover da lista
            de espera, exportar ou apagar — fica registrada com a identificação de quem fez.
          </p>
        </Article>

        <Article title="O que não é feito" id="limites">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Seus dados não são vendidos nem cedidos para fins comerciais.</li>
            <li>Não há publicidade, rastreamento de perfil nem cookies de marketing neste site.</li>
            <li>Não enviamos mensagens sobre outros assuntos ou outros eventos.</li>
          </ul>
        </Article>

        <Article title="Correção e exclusão" id="direitos">
          <p>
            Você pode pedir a correção ou a exclusão da sua inscrição a qualquer momento. O canal de
            contato para isso é uma das informações que ainda serão publicadas nesta página.
          </p>
          <p>
            Para proteger quem já está inscrito, reenviar o formulário com o mesmo número não altera
            os dados guardados: a correção passa sempre por uma pessoa da organização.
          </p>
        </Article>

        <p className="text-body">
          <Link href="/" className={CTA_TERTIARY}>
            Voltar para a página do evento
          </Link>
        </p>
      </main>

      <Grain />
    </>
  );
}

function Article({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3 border-t border-ink-600 pt-8">
      <h2 id={`${id}-titulo`} className="text-h3 text-text-primary">
        {title}
      </h2>
      <div className="text-body flex flex-col gap-3 text-text-secondary">{children}</div>
    </section>
  );
}
