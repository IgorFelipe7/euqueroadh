/**
 * `/privacidade` — PRODUCT-SPEC.md section 12, IMPLEMENTATION-PLAN.md Phase 5.
 *
 * **This notice is final and is indexed.** It replaced an explicitly incomplete page that named its
 * own open questions on its face; the organizers have since answered the two that mattered to a
 * reader — the contact channel (`contato@euqueroadh.com`) and the retention period (30 days after
 * the event) — so the page now states facts rather than pending items, and `robots.index` is on.
 *
 * **Nothing here is invented.** There is no CNPJ, no address, no telephone number, no named DPO and
 * no single named controller, because the repository does not record any of them and a fabricated
 * one reads exactly like a real one. The three organizers are named as the banner names them
 * (EVENT-SOURCE-OF-TRUTH.md section 5, mirrored by `components/site/credits.tsx`), and the contact
 * channel is the one published address. Which of the three is the formal controller is still an
 * internal question; it is tracked in DECISIONS.md and deliberately not raised with the reader,
 * because "we have not decided who is legally responsible" is not information a participant can act
 * on.
 *
 * Every factual claim below is one the implementation actually keeps:
 *
 *   * three fields and no more — `registrationInputSchema` has exactly three keys;
 *   * a 12-year floor — `events.min_age`, enforced inside `register_for_event()`;
 *   * no marketing, no profiling, no analytics — there is no such code and no such vendor;
 *   * restricted administrative access — `admin_users` plus RLS, audited per action.
 *
 * Static. Nothing here depends on a request or on the database.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { Grain } from '@/components/site/grain';
import { CTA_TERTIARY } from '@/components/site/cta';
import { ORGANIZATION_EMAIL, PUBLIC_AGE_MIN } from '@/lib/domain/schemas';

/** The date this copy was last revised, rendered once and stated to the reader. */
const LAST_UPDATED = '12 de setembro de 2026';

export const metadata: Metadata = {
  title: 'Privacidade',
  description:
    'Como os dados informados na inscrição da Palestra Educação Financeira para Jovens são ' +
    'utilizados, com quem podem ser compartilhados e por quanto tempo são guardados.',
  alternates: { canonical: '/privacidade' },
  robots: { index: true, follow: true },
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

          <h1 className="text-h2 mt-2 font-stretch-[105%] text-text-primary">Privacidade</h1>
          <p className="text-body text-text-secondary">
            Este aviso explica de forma simples como os dados informados na inscrição da Palestra
            Educação Financeira para Jovens são utilizados e protegidos.
          </p>
        </header>

        <Article title="Quem organiza o evento" id="organizacao">
          <p>
            O evento é organizado por Marcados pela Graça, Ministério Teen e Assembleia de Deus
            Ministério do Belém em Hortolândia.
          </p>
          <p>
            Para assuntos relacionados à privacidade e aos dados da inscrição, o canal de contato é{' '}
            <MailLink />.
          </p>
        </Article>

        <Article title="Quais dados coletamos" id="coleta">
          <p>A inscrição pelo site coleta apenas três informações:</p>
          <List
            items={['nome;', 'idade;', 'número de celular.']}
          />
          <p>
            Durante o uso do formulário, também são processadas informações técnicas estritamente
            necessárias à segurança do site e à verificação antirrobô. Isso não acrescenta nenhum
            campo à inscrição: continuam sendo apenas os três dados acima.
          </p>
        </Article>

        <Article title="Para que usamos seus dados" id="finalidade">
          <p>As finalidades são estritamente estas:</p>
          <List
            items={[
              'identificar e administrar a inscrição;',
              'verificar a elegibilidade etária para a inscrição online;',
              'controlar capacidade e lista de espera;',
              'permitir a operação administrativa do evento;',
              'entrar em contato sobre a inscrição ou sobre informações operacionais do evento, quando necessário;',
              'proteger o formulário e o sistema contra fraude, abuso e inscrições automatizadas.',
            ]}
          />
          <p className="text-text-primary">
            Não vendemos os dados dos participantes e não utilizamos os dados da inscrição para
            publicidade ou marketing.
          </p>
        </Article>

        <Article title="Com quem os dados podem ser compartilhados" id="compartilhamento">
          <p>O acesso aos dados da inscrição é limitado a:</p>
          <List
            items={[
              'pessoas autorizadas da organização do evento;',
              'fornecedores de infraestrutura, hospedagem, banco de dados, autenticação e segurança estritamente necessários para operar o serviço.',
            ]}
          />
          <p>
            Esses fornecedores são utilizados apenas na medida necessária para fornecer e proteger o
            serviço.
          </p>
        </Article>

        <Article title="Adolescentes" id="adolescentes">
          <p>A inscrição online é destinada a pessoas com {PUBLIC_AGE_MIN} anos ou mais.</p>
          <p>
            A partir dos {PUBLIC_AGE_MIN} anos, adolescentes podem utilizar o fluxo normal de
            inscrição.
          </p>
          <p>
            Para pessoas com menos de {PUBLIC_AGE_MIN} anos, o formulário online não deve ser
            utilizado. O responsável deve entrar em contato pelo e-mail <MailLink />.
          </p>
          <p>
            Dados que envolvam crianças e adolescentes são tratados com atenção especial à
            privacidade, à necessidade e ao melhor interesse da pessoa.
          </p>
        </Article>

        <Article title="Por quanto tempo guardamos os dados" id="retencao">
          <p>
            Os dados pessoais da inscrição serão mantidos por até 30 dias após a realização do
            evento. Após esse período, serão excluídos ou anonimizados, salvo quando a conservação
            for necessária para cumprimento de obrigação legal ou para o exercício e defesa de
            direitos.
          </p>
        </Article>

        <Article title="Seus direitos" id="direitos">
          <p>Quando aplicável, você pode solicitar:</p>
          <List
            items={[
              'confirmação da existência de tratamento;',
              'acesso aos seus dados;',
              'correção de dados incompletos, inexatos ou desatualizados;',
              'informações sobre o uso e o compartilhamento dos dados;',
              'exclusão dos dados, quando cabível.',
            ]}
          />
          <p>
            Os pedidos devem ser enviados para <MailLink />.
          </p>
        </Article>

        <Article title="Segurança" id="seguranca">
          <p>
            O acesso administrativo é restrito a pessoas autorizadas, cada uma com sua própria conta,
            e adotamos medidas técnicas e organizacionais para reduzir riscos de acesso não
            autorizado, perda, alteração ou uso indevido dos dados. Nenhum sistema é absolutamente
            seguro, e por isso essas medidas são revisadas conforme necessário.
          </p>
        </Article>

        <Article title="Atualizações deste aviso" id="atualizacoes">
          <p>
            Este aviso pode ser atualizado quando necessário. A versão vigente é sempre a publicada
            nesta página.
          </p>
          <p className="text-text-muted">Última atualização: {LAST_UPDATED}.</p>
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

/** The one published contact channel, written once so it can never disagree with itself. */
function MailLink() {
  return (
    <a href={`mailto:${ORGANIZATION_EMAIL}`} className={CTA_TERTIARY}>
      {ORGANIZATION_EMAIL}
    </a>
  );
}

function List({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
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
    <section
      aria-labelledby={`${id}-titulo`}
      className="flex flex-col gap-3 border-t border-ink-600 pt-8"
    >
      <h2 id={`${id}-titulo`} className="text-h3 text-text-primary">
        {title}
      </h2>
      <div className="text-body flex flex-col gap-3 text-text-secondary">{children}</div>
    </section>
  );
}
