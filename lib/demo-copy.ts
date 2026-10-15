/**
 * Every string the demonstration deployment adds (docs/DEMO.md).
 *
 * A plain module rather than part of `lib/env.ts`, because Client Components may import copy and
 * must never import the environment.
 */
export const DEMO_COPY = {
  banner: 'Ambiente de demonstração com dados fictícios. Tudo volta ao estado inicial todos os dias.',
  sourceLink: 'Ver o código',
  signIn: {
    heading: 'Demonstração',
    body:
      'Entre como organizador para explorar o painel com inscrições fictícias. ' +
      'Convites e remoção de organizadores ficam desativados.',
    button: 'Entrar na demonstração',
  },
  unavailable: 'A demonstração está indisponível no momento. Tente de novo em instantes.',
  blocked: 'Essa ação fica desativada no ambiente de demonstração.',
} as const;

export const DEMO_SOURCE_URL = 'https://github.com/IgorFelipe7/euqueroadh';
