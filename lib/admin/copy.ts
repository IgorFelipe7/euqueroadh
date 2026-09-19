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
  /** Attendance: a person who is not confirmed cannot be marked present. */
  'not_confirmed',
  'invalid_attendance',
  /** Raffles. */
  'raffle_not_found',
  'invalid_raffle_name',
  'invalid_prize_label',
  'invalid_winners_target',
  'winners_below_drawn',
  'raffle_already_drawn',
  'raffle_complete',
  'draw_pending',
  'draw_not_found',
  'draw_already_resolved',
  'invalid_outcome',
  'pool_empty',
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
    case 'not_confirmed':
      return 'Só é possível marcar presença de quem tem vaga confirmada. Confirme a vaga primeiro.';
    case 'invalid_attendance':
      return 'Não foi possível registrar a presença. Tente novamente.';
    case 'raffle_not_found':
      return 'Este sorteio não existe mais. Recarregue a página.';
    case 'invalid_raffle_name':
      return 'Dê um nome ao sorteio (entre 2 e 80 caracteres).';
    case 'invalid_prize_label':
      return 'Descreva o prêmio em até 80 caracteres, ou deixe em branco.';
    case 'invalid_winners_target':
      return 'Informe quantas pessoas serão sorteadas (de 1 a 50).';
    case 'winners_below_drawn':
      return `Este sorteio já tem ${error.detail ?? 0} ${
        error.detail === 1 ? 'vencedor confirmado' : 'vencedores confirmados'
      }. Não é possível reduzir abaixo disso.`;
    case 'raffle_already_drawn':
      return 'Este sorteio já começou. Quem participa e a exclusão de quem já ganhou não podem mais mudar — reinicie o sorteio para alterá-los.';
    case 'raffle_complete':
      return 'Este sorteio já tem todos os vencedores. Aumente o número de sorteados ou reinicie.';
    case 'draw_pending':
      return 'Há um resultado aguardando confirmação. Confirme ou sorteie novamente antes de continuar.';
    case 'draw_not_found':
      return 'Este resultado não existe mais. Recarregue a página.';
    case 'draw_already_resolved':
      return 'Este resultado já foi decidido por outra pessoa. Recarregue a página.';
    case 'invalid_outcome':
      return 'Não foi possível registrar o resultado. Tente novamente.';
    case 'pool_empty':
      return 'Ninguém está participando deste sorteio. Marque presenças ou troque quem participa.';
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
    attendance: 'Presença',
    raffles: 'Sorteio',
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
  attendance: {
    title: 'Presença',
    description: 'Marque quem chegou. Use esta tela na porta, no celular.',
    searchLabel: 'Buscar por nome ou celular',
    searchPlaceholder: 'Nome ou celular',
    mark: 'Marcar presença',
    marking: 'Marcando…',
    present: 'Presente',
    undo: 'Desfazer',
    arrivedAt: (time: string) => `Presente · ${time}`,
    count: (present: number, confirmed: number) => `${present} de ${confirmed} presentes`,
    empty: 'Digite um nome ou celular para encontrar a pessoa.',
    emptySearch: (term: string) => `Ninguém encontrado para «${term}».`,
    onlyConfirmed:
      'Apenas quem tem vaga confirmada aparece aqui. Quem está na lista de espera precisa ter a ' +
      'vaga confirmada antes.',
    hint: 'A presença define quem participa do sorteio e quem recebe certificado.',
  },

  /**
   * Self check-in at the venue — the launch brief's PART A.
   *
   * Every sentence here is operational rather than explanatory: the organizer reading it is standing
   * at a door with a queue in front of them. The reassurance that matters is that the manual list
   * below never goes away, which is why `fallback` is on the panel itself and not in a help page.
   */
  checkIn: {
    title: 'Check-in do evento',
    description: 'Deixe o QR na tela da entrada. Quem chega confirma a própria presença.',

    stateOpen: 'Aberto',
    stateClosed: 'Fechado',

    open: 'Abrir check-in',
    opening: 'Abrindo…',
    close: 'Fechar check-in',
    closing: 'Fechando…',
    rotate: 'Gerar novo QR',
    rotating: 'Gerando…',
    showWall: 'Exibir QR em tela cheia',

    opened: 'Check-in aberto. Exiba o QR na entrada.',
    closed: 'Check-in fechado. O link público deixou de funcionar.',
    alreadyClosed: 'O check-in já estava fechado.',
    rotated: 'Novo QR gerado. O QR anterior deixou de funcionar.',

    closedHint:
      'Enquanto o check-in está fechado, ninguém confirma presença pelo celular. A lista abaixo '
      + 'continua funcionando normalmente.',
    openHint: (until: string) => `Este QR funciona até ${until}.`,
    urlLabel: 'Endereço do check-in',

    fallback:
      'A lista abaixo continua sendo a forma de resolver exceções: sem internet, celular '
      + 'descarregado, dados que não batem.',

    /** The confirmations. Both actions invalidate a QR that people may already be looking at. */
    confirmClose:
      'Fechar o check-in? O QR que está na tela deixa de funcionar imediatamente.',
    confirmRotate:
      'Gerar um novo QR? O QR que está na tela deixa de funcionar imediatamente e precisa ser '
      + 'substituído.',

    /** The wall. No participant name ever appears on it (launch brief § 3). */
    wall: {
      title: 'Check-in',
      arrived: 'Você chegou.',
      confirm: 'Confirme sua presença.',
      instruction: 'Aponte a câmera do seu celular',
      countLabel: 'já chegaram',
      countLabelSingular: 'já chegou',
      exit: 'Sair',
      fullscreen: 'Tela cheia',
      exitFullscreen: 'Sair da tela cheia',
      stale: 'Sem atualização',
    },
  },
  raffles: {
    title: 'Sorteio',
    description: 'Sorteios ao vivo entre as pessoas presentes.',
    create: 'Novo sorteio',
    nameLabel: 'Nome do sorteio',
    namePlaceholder: 'Sorteio 1',
    prizeLabel: 'Prêmio (opcional)',
    prizePlaceholder: 'Kit de educação financeira',
    poolLabel: 'Quem participa',
    poolAttended: 'Somente quem está presente',
    poolConfirmed: 'Todos os confirmados',
    poolHint:
      'Sortear entre os presentes evita sortear alguém que não está na sala. Marque as presenças ' +
      'na tela Presença.',
    winnersLabel: 'Quantas pessoas serão sorteadas',
    excludeLabel: 'Não sortear quem já ganhou outro sorteio deste evento',
    save: 'Salvar sorteio',
    saving: 'Salvando…',
    created: 'Sorteio criado.',
    updated: 'Sorteio atualizado.',
    deleted: 'Sorteio excluído.',
    reset: (cleared: number) =>
      `Sorteio reiniciado. ${cleared} ${cleared === 1 ? 'resultado apagado' : 'resultados apagados'}.`,
    openStage: 'Abrir palco',
    configure: 'Configurar',
    resetCta: 'Reiniciar',
    deleteCta: 'Excluir',
    progress: (done: number, target: number) => `${done} de ${target} sorteados`,
    statusDraft: 'Não iniciado',
    statusRunning: 'Em andamento',
    statusFinished: 'Concluído',
    empty: 'Nenhum sorteio criado ainda.',
    emptyHint: 'Crie um sorteio antes do evento e abra o palco na hora.',
    eligible: (count: number) =>
      `${count} ${count === 1 ? 'pessoa participando' : 'pessoas participando'}`,
    confirmations: {
      reset:
        'Reiniciar este sorteio? Todos os resultados já sorteados serão apagados e o sorteio ' +
        'volta ao início.',
      remove: 'Excluir este sorteio? Os resultados já sorteados serão apagados junto.',
    },
    stage: {
      hint: 'barra de espaço para sortear',
      draw: 'Sortear',
      drawing: 'Sorteando',
      confirm: 'Confirmar',
      forfeit: 'Não está aqui',
      exit: 'Sair do palco',
      fullscreen: 'Tela cheia',
      drawn: 'Já sorteados',
      complete: 'Sorteio concluído',
      shortcuts: 'Espaço sorteia · Enter confirma · X sorteia de novo · F tela cheia · Esc sai',
      /** Announced to screen readers, and the reason the stage is not a keyboard-only interface. */
      announceWinner: (name: string) => `Resultado: ${name}`,
    },
  },
  certificates: {
    title: 'Certificados',
    switchLabel: 'Certificados liberados',
    switchHint:
      'Quando ligado, quem esteve presente pode baixar o certificado pelo link pessoal. ' +
      'Ligue depois que o evento terminar.',
    rowAction: 'Certificado',
    copy: 'Copiar link',
    copied: 'Link copiado.',
    whatsapp: 'Enviar no WhatsApp',
    unavailable: 'Disponível apenas para quem esteve presente.',
    disabled: 'Ligue «Certificados liberados» nas Configurações para que o link funcione.',
    message: (name: string, url: string) =>
      `Oi, ${name}! Seu certificado de participação na palestra Educação Financeira para Jovens ` +
      `está aqui: ${url}`,
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
  'registration.attendance_set': 'Presença registrada',
  'registrations.exported': 'Exportação de inscrições',
  'registrations.purged': 'Inscrições apagadas',
  'admin.invited': 'Organizador convidado',
  'admin.deactivated': 'Acesso desativado',
  'admin.reactivated': 'Acesso reativado',
  'admin.removed': 'Organizador removido',
  'raffle.created': 'Sorteio criado',
  'raffle.updated': 'Sorteio alterado',
  'raffle.deleted': 'Sorteio excluído',
  'raffle.drawn': 'Sorteio realizado',
  'raffle.draw_resolved': 'Resultado do sorteio confirmado',
  'raffle.reset': 'Sorteio reiniciado',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
