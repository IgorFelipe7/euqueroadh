/**
 * Every sentence the admin shows, and the mapping from a database error to one of them.
 *
 * Two reasons this is one pure module rather than strings scattered through components:
 *
 *   * **No provider text ever reaches a person.** The RPCs raise named errors (`settings_conflict`,
 *     `capacity_below_confirmed:78`, …) precisely so that the interface can translate them. The
 *     translation is here, it is total, and its fallback is a generic sentence plus a correlation
 *     code — never a SQLSTATE, a relation name or a PostgREST envelope
 *     (ADMIN-SPEC.md section 7.3).
 *   * **It is testable without a browser or a database.** The mapping is where a mistake would be
 *     invisible: a missed case reads as "Algo deu errado" and looks like an outage.
 *
 * pt-BR throughout.
 */

import { PUBLIC_AGE_MIN } from '@/lib/domain/schemas';

/** The named errors the administrative RPCs raise, plus this layer's two of its own. */
export const ADMIN_ERROR_CODES = [
  'not_authorized',
  'settings_conflict',
  'capacity_below_confirmed',
  'capacity_required_to_open',
  'invalid_capacity',
  'invalid_count',
  'invalid_name',
  'invalid_age',
  'invalid_email',
  'event_not_found',
  'registration_not_found',
  'admin_not_found',
  'cannot_modify_self',
  'last_active_admin',
  /** Raised by `promote_registration` when the row moved, or when the last seat just went. */
  'not_waitlisted',
  'no_headroom',
  /** The database answered with something this application does not model. */
  'unavailable',
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export interface AdminError {
  readonly code: AdminErrorCode;
  /** Present for `capacity_below_confirmed`, which names the number it refused. */
  readonly detail?: number;
}

/**
 * The message a person reads.
 *
 * `not_authorized` is phrased as an expired session rather than as a permission error, because that
 * is overwhelmingly what it is: an administrator whose access was revoked mid-session is the rare
 * case, and both are resolved by the same action.
 */
export function adminErrorMessage(error: AdminError): string {
  switch (error.code) {
    case 'not_authorized':
      return 'Sua sessão expirou. Recarregue a página para entrar novamente.';
    case 'settings_conflict':
      return 'As configurações foram alteradas por outra pessoa. Recarregue a página para ver os valores atuais.';
    case 'capacity_below_confirmed':
      return `Não é possível definir a capacidade abaixo de ${error.detail ?? 0} inscrições confirmadas. Cancele inscrições primeiro.`;
    case 'capacity_required_to_open':
      return 'Defina a capacidade antes de abrir as inscrições.';
    case 'invalid_capacity':
      return 'Informe uma capacidade válida.';
    case 'invalid_count':
      return 'Informe quantas pessoas promover.';
    case 'invalid_name':
      return 'Informe o nome completo.';
    case 'invalid_age':
      return 'Informe uma idade válida.';
    case 'invalid_email':
      return 'Informe um e-mail válido.';
    case 'event_not_found':
      return 'Este evento não existe mais. Recarregue a página.';
    case 'registration_not_found':
      return 'Esta inscrição não existe mais. Recarregue a página.';
    case 'admin_not_found':
      return 'Este organizador não existe mais. Recarregue a página.';
    case 'cannot_modify_self':
      return 'Você não pode remover seu próprio acesso.';
    case 'last_active_admin':
      return 'É necessário manter pelo menos um organizador ativo.';
    case 'not_waitlisted':
      return 'Esta inscrição não está mais na lista de espera. Recarregue a página.';
    case 'no_headroom':
      return 'Não há vagas livres. Aumente a capacidade ou cancele uma inscrição confirmada.';
    case 'unavailable':
      return 'Não foi possível concluir a ação. Tente novamente.';
  }
}

/** Status labels. Every pill carries its label, never colour alone (ADMIN-SPEC.md section 8). */
export const STATUS_LABELS = {
  confirmed: 'Confirmada',
  waitlisted: 'Lista de espera',
  cancelled: 'Cancelada',
} as const;

/** The same three, as an export cell (DATABASE-SECURITY.md section 10.8). */
export const EXPORT_STATUS_LABELS = STATUS_LABELS;

export const ADMIN_COPY = {
  brand: 'Palestra — Educação Financeira para Jovens',
  nav: {
    dashboard: 'Painel',
    registrations: 'Inscrições',
    settings: 'Configurações',
    team: 'Equipe',
    signOut: 'Sair',
  },
  dashboard: {
    confirmed: 'Confirmadas',
    waitlisted: 'Lista de espera',
    free: 'Vagas livres',
    cancelled: 'Canceladas',
    capacityUndefined: 'Capacidade não definida',
    capacityPrompt: 'Defina a capacidade antes de abrir as inscrições.',
    goToSettings: 'Ir para Configurações',
    full: 'Lotado',
    latest: 'Últimas inscrições',
    seeAll: 'Ver todas',
    registrationsLabel: 'Inscrições',
    open: 'Abertas',
    closed: 'Encerradas',
    waitlistLabel: 'Lista de espera',
    waitlistOn: 'Ativada',
    waitlistOff: 'Desativada',
    noRegistrations: 'Ainda não há inscrições.',
    noRegistrationsHint: 'Assim que alguém se inscrever, as informações aparecem aqui.',
    viewPublicPage: 'Ver página pública',
  },
  confirmations: {
    closeRegistrations:
      'Encerrar as inscrições? A página pública deixará de aceitar novas inscrições imediatamente.',
    waitlistOff: (queued: number) =>
      `${queued === 1 ? '1 pessoa já está' : `${queued} pessoas já estão`} na lista e ` +
      'continuam podendo ser promovidas. Apenas novas inscrições serão recusadas.',
    promote: (count: number) =>
      `${count === 1 ? '1 pessoa passará' : `${count} pessoas passarão`} a ter vaga confirmada. ` +
      'Você precisará avisá-las pelo celular — o sistema não envia mensagens.',
    cancel: (name: string) => `Cancelar a inscrição de ${name}? A vaga será liberada.`,
    confirmSeat: (name: string) =>
      `Confirmar a vaga de ${name}? Você precisará avisá-la pelo celular.`,
    acknowledgePermanent: 'Entendo que esta ação é permanente',
  },
  registrations: {
    title: 'Inscrições',
    searchLabel: 'Buscar por nome ou celular',
    searchPlaceholder: 'Nome ou celular',
    clearSearch: 'Limpar busca',
    seeAll: 'Ver todas',
    exportCta: (rows: number) => `Exportar ${rows} ${rows === 1 ? 'resultado' : 'resultados'}`,
    exportWarning: 'O arquivo contém dados pessoais. Guarde com cuidado.',
    emptyAll: 'Ainda não há inscrições.',
    emptySearch: (term: string) => `Nenhuma inscrição encontrada para «${term}».`,
    emptyStatus: 'Nenhuma inscrição com este status.',
    count: (rows: number) => `${rows} ${rows === 1 ? 'inscrição' : 'inscrições'}`,
    results: (rows: number, term: string) =>
      `${rows} ${rows === 1 ? 'resultado' : 'resultados'} para «${term}»`,
    previous: 'Anterior',
    next: 'Próxima',
    page: (page: number, pages: number) => `Página ${page} de ${pages}`,
  },
  settings: {
    title: 'Configurações',
    capacityLabel: 'Capacidade',
    capacityHint: 'Número máximo de inscrições confirmadas.',
    capacityFloor: (confirmed: number) =>
      `Mínimo permitido agora: ${confirmed} (inscrições já confirmadas).`,
    waitlistHint: 'Quando as vagas acabarem, novas inscrições entram na lista de espera.',
    registrationsHint:
      'Encerrar interrompe novas inscrições imediatamente, independentemente da capacidade.',
    save: 'Salvar alterações',
    saving: 'Salvando…',
    saved: 'Configurações atualizadas.',
    reload: 'Recarregar',
    readOnlyTitle: 'Informações do evento',
    readOnlyNote:
      'Estas informações vêm da configuração do evento. Para alterá-las, fale com quem mantém o sistema.',
    agePolicy: (min: number) =>
      `A inscrição online aceita ${min} anos ou mais. Participantes mais novos são atendidos pela ` +
      'organização por e-mail.',
    agePolicyValue: `${PUBLIC_AGE_MIN} anos ou mais`,
  },
  team: {
    title: 'Equipe',
    invite: 'Convidar organizador',
    inviteHint:
      'A pessoa receberá um convite por e-mail e poderá entrar com um código. Organizadores têm ' +
      'acesso total às inscrições, incluindo dados pessoais.',
    inviteSent: (email: string) => `Convite enviado para ${email}.`,
    inviteExisting: 'Essa conta já existia e agora tem acesso.',
    deactivate: 'Desativar',
    reactivate: 'Reativar',
    remove: 'Remover definitivamente',
    removedWithResidue:
      'Acesso revogado, mas a conta de autenticação ainda existe. Tentar remover novamente.',
    removed: 'Organizador removido.',
    deactivated: 'Acesso desativado.',
    reactivated: 'Acesso reativado.',
    active: 'Ativo',
    inactive: 'Desativado',
    you: '(você)',
  },
  purge: {
    title: 'Encerrar evento e apagar dados',
    body:
      'Apaga permanentemente todas as inscrições deste evento — nomes, idades e celulares. Use isto ' +
      'quando o evento tiver terminado e os dados não forem mais necessários.',
    consequence: 'As inscrições também serão encerradas, para que o evento não volte a coletar dados.',
    cta: 'Apagar todas as inscrições',
    done: (count: number) => `${count} ${count === 1 ? 'inscrição apagada' : 'inscrições apagadas'}.`,
  },
  audit: {
    title: 'Auditoria',
    empty: 'Nenhuma ação registrada ainda.',
    intro:
      'Toda alteração feita por um organizador fica registrada aqui, com quem fez e quando. ' +
      'Os registros nunca contêm nome, idade ou celular de participantes.',
  },
} as const;

/** Human labels for `admin_actions.action`. An unknown action renders its raw key, never a crash. */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  'settings.updated': 'Configurações alteradas',
  'registration.cancelled': 'Inscrição cancelada',
  'registration.promoted': 'Promoção da lista de espera',
  'registration.edited': 'Inscrição corrigida',
  'registration.deleted': 'Inscrição excluída',
  'registrations.exported': 'Exportação de inscrições',
  'registrations.purged': 'Inscrições apagadas',
  'admin.invited': 'Organizador convidado',
  'admin.deactivated': 'Acesso desativado',
  'admin.reactivated': 'Acesso reativado',
  'admin.removed': 'Organizador removido',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
