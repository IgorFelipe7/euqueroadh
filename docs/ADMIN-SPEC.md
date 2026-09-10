# Admin Specification

The operational surface for a small team of volunteer organizers. Visual language:
[VISUAL-DIRECTION.md § 12](./VISUAL-DIRECTION.md). Authorization and data rules:
[DATABASE-SECURITY.md § 7–8](./DATABASE-SECURITY.md).

**Design brief in one sentence:** an organizer opens `/admin` on their phone at the venue door and
knows, in under three seconds and without scrolling, how many people are confirmed, how many are
waiting, and whether there is anything they need to do.

All interface copy is pt-BR.

---

## 1. Information architecture

Four destinations. No sub-navigation, no settings-within-settings.

| Route | Label | Purpose |
| --- | --- | --- |
| `/admin` | `Painel` | Event state at a glance, plus the actions that state implies |
| `/admin/inscricoes` | `Inscrições` | The full list: search, filter, sort, per-person actions, export |
| `/admin/configuracoes` | `Configurações` | Capacity, waitlist, registrations open/closed |
| `/admin/equipe` | `Equipe` | Invite, deactivate and remove administrators |
| `/admin/entrar` | — | Sign-in (public route) |
| `/admin/sem-acesso` | — | Signed in, but not an authorized administrator |

**Chrome.** Desktop: a 220 px left sidebar with the event title, the four links, and the signed-in
administrator's name plus `Sair` at the bottom. Mobile: a top bar with the event title and a
bottom tab bar with the four destinations — thumb-reachable, which matters because the phone is the
device an organizer actually has at the door.

**No breadcrumbs, no global search, no command palette, no notification bell, no dark-mode toggle.**
Four pages do not need wayfinding.

---

## 2. Sign-in — `/admin/entrar`

Email OTP. No password field anywhere in the product.

**Step 1 — request a code**

> ### Entrar
> Informe o e-mail da sua conta de organizador.
>
> `E-mail` [ ______________________ ]
>
> `[ Enviar código ]`
>
> O acesso é restrito a organizadores convidados.

**Step 2 — enter the code**

> ### Verifique seu e-mail
> Enviamos um código de 6 dígitos para **igor@exemplo.com**.
>
> `Código` [ _ _ _ _ _ _ ]
>
> `[ Entrar ]`   `Usar outro e-mail`   `Reenviar código (60s)`

Requirements:

- The code input is `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"` — one
  field, not six boxes. Six boxes break paste, break autofill and break screen readers.
- The resend button is disabled for 60 seconds, matching Supabase's own OTP window, with a visible
  countdown so the wait is explained rather than mysterious.
- **Requesting a code must never create an account.** Every `signInWithOtp` call passes
  `options: { shouldCreateUser: false }`. The Supabase default is `true`, which would turn this
  public form into an account-creation endpoint. This is mandatory and is layered on top of
  project-level sign-up being disabled — see
  [DATABASE-SECURITY.md § 7.1.1](./DATABASE-SECURITY.md).
- **The response never reveals whether the address exists.** With `shouldCreateUser: false` the
  underlying Supabase responses *do* differ — success for a known address, an error for an unknown
  one — so the route handler **must normalise them**: both render the identical
  `Verifique seu e-mail` screen, with the same 60-second resend window and the same body. The real
  distinction is logged server-side only, with the address reduced to its domain. This is what stops
  the sign-in page from becoming an administrator-enumeration oracle.
- Never render Supabase's raw error text. A wrong code, an expired code and a code for a
  non-existent address all produce the same `Código inválido ou expirado. Peça um novo código.`
  No attempt counter is shown.
- After sign-in, redirect to the originally requested URL if it was under `/admin`, otherwise to
  `/admin`. The redirect target is validated against an allowlist of internal paths — never taken
  raw from a query parameter.
- Arriving with `?motivo=sessao-expirada` shows `Sua sessão expirou. Entre novamente.` above the form.
- No "remember me". The session cookie's lifetime is Supabase's, and `Sair` clears it.

**`/admin/sem-acesso`** — for someone who authenticated successfully but is not in `admin_users`, or
whose access was deactivated:

> ### Sua conta não tem acesso a esta área
> Se você deveria ter acesso, peça a um organizador para incluir seu e-mail.
>
> `[ Sair ]`

Deliberately **not** a 404. A volunteer whose access was just revoked deserves an explanation, not a
puzzle. The page reveals nothing about the event or its data.

---

## 3. Dashboard — `/admin`

Everything below fits above the fold on a laptop and within one short scroll on a phone.

```
┌────────────────────────────────────────────────────────┐
│ Palestra — Educação Financeira para Jovens             │
│ sábado, 19 de setembro · 19h às 21h                    │
├────────────────────────────────────────────────────────┤
│                                                        │
│   78            12              2                      │
│   Confirmadas   Lista de espera Vagas livres           │
│                                                        │
│   ████████████████████████████████████░░  ▓▓           │
│   78 de 80 vagas                    +12 na espera      │
│                                                        │
├────────────────────────────────────────────────────────┤
│ ⚠  Há 2 vagas livres e 12 pessoas na lista de espera.  │
│    [ Promover próximas 2 ]                             │
├────────────────────────────────────────────────────────┤
│ Inscrições  ( Abertas | Encerradas )                   │
│ Lista de espera  [ ●── ] ativada                       │
├────────────────────────────────────────────────────────┤
│ Últimas inscrições                    Ver todas →      │
│ Ana Paula Ribeiro    17  (19) 99123-4567  há 4 min  ✅ │
│ Lucas Moreira        19  (19) 99988-1122  há 11 min ✅ │
│ Beatriz Nunes        16  (19) 99555-3344  há 23 min ⏳ │
│ …                                                      │
└────────────────────────────────────────────────────────┘
```

### 3.1 The three numbers

`Confirmadas`, `Lista de espera`, `Vagas livres` — read directly from `events.confirmed_count`,
`events.waitlist_count` and `capacity − confirmed_count`. Set large, tabular-figure, with the label
beneath. These are the only numbers an organizer needs, and they are guaranteed correct by
invariant **I2**.

### 3.2 The capacity meter

The only chart-like element in the entire admin, because it answers a real operational question that
three separate numbers answer less well: *how close are we, and how much overflow is waiting?*

- A single horizontal bar, height 12 px, `r-field` radius.
- Filled segment = confirmed (blue), remainder = free (grey).
- Waitlist drawn as a distinct segment **outside** the bar's right edge (amber), visually
  overflowing — which is exactly what a waitlist is.
- Text beneath: `78 de 80 vagas` and `+12 na espera`, so the meter is never the only carrier of the
  information.
- `role="img"` with an `aria-label` reading the full state:
  `78 de 80 vagas confirmadas, 12 pessoas na lista de espera`.
- At capacity: the bar turns fully blue and the label becomes `Lotado`.
- **`capacity = 0` (the seeded default):** the bar renders empty, the label reads
  `Capacidade não definida`, and an inline call to action appears:
  `Defina a capacidade antes de abrir as inscrições.` `[ Ir para Configurações ]`. In this state the
  `Inscrições` segmented control's `Abertas` option is disabled with that same sentence as its
  explanation — the database refuses the transition anyway (**I7**), so the UI must not offer it and
  then fail. See [DATABASE-SECURITY.md § 6.6](./DATABASE-SECURITY.md).

**No other chart exists.** A registrations-over-time line would not change any decision an organizer
makes about a free two-hour local event, and building it would be decoration.

### 3.3 The promotion prompt

The dashboard's single most important behaviour. It appears **only** when
`vagas livres > 0 AND lista de espera > 0`:

> ⚠ Há **2** vagas livres e **12** pessoas na lista de espera.
> `[ Promover próximas 2 ]`

- The button label always names the real number, capped at the headroom.
- Confirmation dialog, because promotion creates an obligation to telephone people:
  > **Promover 2 pessoas da lista de espera?**
  > Elas passarão a ter vaga confirmada. **Você precisará avisá-las pelo celular** — o sistema não
  > envia mensagens.
  > `[ Cancelar ]` `[ Promover 2 ]`
- On success, the promoted people are listed **with name and phone number**, and remain on screen
  until dismissed, so the organizer can make the calls straight away:
  > ✅ 2 pessoas promovidas. Avise cada uma:
  > · Beatriz Nunes — (19) 99555-3344
  > · Rafael Lima — (19) 99777-8899
  > `[ Copiar lista ]` `[ Entendi ]`
- If the headroom disappeared between render and click (another admin acted first), the action
  returns fewer rows and the UI says so honestly:
  `Apenas 1 de 2 pessoas foi promovida — não havia mais vagas.`

This prompt is the entire user-facing consequence of the "no automatic promotion" decision
([DATABASE-SECURITY.md § 6.8](./DATABASE-SECURITY.md)). It must be prominent, and its copy must state
plainly that the system sends no messages.

### 3.4 Inline controls

`Inscrições` as a two-option segmented control (`Abertas` / `Encerradas`) and `Lista de espera` as a
switch. Both are on the dashboard as well as in Settings because they are the two things an organizer
changes under time pressure — often on a phone, minutes before the doors open.

- Closing registrations asks for confirmation: `Encerrar as inscrições? A página pública deixará de
  aceitar novas inscrições imediatamente.`
- Opening them does not.
- Turning the waitlist **off** asks for confirmation and states the consequence:
  `As 12 pessoas já na lista de espera continuam na lista e podem ser promovidas. Apenas novas
  inscrições passarão a ser recusadas.`
- Both trigger `revalidatePath('/')` so the public page reflects the change within seconds.

### 3.5 Latest registrations

The five most recent, any status, newest first: name, age, masked-free phone, relative time
(`há 4 min`), status pill. Row tap opens the same detail panel as the list page. `Ver todas →` links
to `/admin/inscricoes`.

Its purpose is confidence — an organizer glances and sees the system is alive — not analysis.

---

## 4. Registrations — `/admin/inscricoes`

### 4.1 Controls

All state lives in the URL, so a view can be bookmarked, shared between organizers, and reloaded
without loss. All filtering, sorting and pagination happen **server-side**; the full participant list
is never shipped to the browser.

| Control | Parameter | Values |
| --- | --- | --- |
| Search | `?q=` | Free text: matches an accent-insensitive substring of the name, or a phone-number prefix (digits only) |
| Status filter | `?status=` | `todas` (default) · `confirmada` · `espera` · `cancelada` |
| Sort | `?sort=` | `recentes` (default) · `antigas` · `nome` · `espera` (waitlist order — only offered when the status filter is `espera`) |
| Page | `?page=` | 1-based, 50 rows per page |

- The search input debounces at 300 ms and updates the URL with `replace` so it does not fill the
  browser's history.
- Search matches names accent-insensitively (`joao` finds `João`) via the generated `search_name`
  column, and phone numbers by digit prefix, so typing `99123` finds `(19) 99123-4567`.
- Status filters are chips showing live counts: `Todas (90)` `Confirmadas (78)` `Lista de espera (12)`
  `Canceladas (3)`.
- The header always shows the total for the current filter: `90 inscrições` / `12 resultados para
  «beatriz»`.
- Sorting is by clicking a column header, which is a `<button>` inside the `<th>` with `aria-sort`
  set to `ascending` / `descending` / `none`.

### 4.2 Table — desktop (≥ 640 px)

A real `<table>` with a visually-hidden `<caption>` and `<th scope="col">` on every header.

| Nome | Idade | Celular | Status | Inscrita em | |
| --- | --- | --- | --- | --- | --- |
| Ana Paula Ribeiro | 17 | (19) 99123-4567 | ● Confirmada | 09/09/2026 20:14 | ⋯ |
| Beatriz Nunes | 16 | (19) 99555-3344 | ● Lista de espera · 3º | 09/09/2026 19:51 | ⋯ |
| Carlos Eduardo Souza | 21 | (19) 99777-8899 | ● Cancelada | 08/09/2026 11:02 | ⋯ |

- Row height 40 px. Zebra striping is **not** used; a 1 px bottom border is quieter and easier to
  scan.
- Phone numbers are displayed in the human `(DD) 9NNNN-NNNN` format, and are `<a href="tel:">` links
  — on a phone that turns the list into a one-tap dialer, which is precisely how a waitlist call
  happens.
- Status is a pill carrying its own label (never colour alone). Waitlisted rows also show their
  live queue position, computed as the rank of `waitlist_rank` among currently-waitlisted rows —
  not the raw stored value, which has gaps by design.
- Names use `overflow-wrap: anywhere` and a `max-width` in `ch`, so a 90-character name wraps
  instead of breaking the layout.
- Timestamps are absolute in the table (`09/09/2026 20:14`) and relative only in the dashboard's
  recent list. A table is for comparison, and absolute values compare.

### 4.3 Table — mobile (< 640 px)

**One semantic `<table>` at every width.** Two rejected alternatives and why:

- *A horizontally scrolling table* — hides the actions column behind a swipe and fails WCAG 2.2
  SC 2.4.11 when a focused control sits off-screen.
- *A separate card list rendered alongside the table and toggled with CSS* — duplicates every
  participant's data in the DOM, which screen readers may announce twice.

The specified approach is **priority columns**:

- Below 640 px, `Idade` and `Inscrita em` are `display: none`.
- Visible: `Nome` (with the phone beneath it in `text-muted`), `Status`, and the actions button.
- Tapping the row opens a **detail panel** (a native `<dialog>` opened with `showModal()`, which
  supplies focus trapping, Escape-to-close and background inert for free) containing every field and
  every action, with 48 px targets.
- The hidden columns are therefore never lost — they move one tap away, in a comfortable layout.

### 4.4 Row actions

In the `⋯` menu on desktop, and as full-width buttons in the detail panel on mobile.

| Action | Availability | Confirmation |
| --- | --- | --- |
| `Ver detalhes` | always | — |
| `Ligar` (`tel:` link) | always | — |
| `Confirmar vaga` | waitlisted, and headroom > 0 | `Confirmar a vaga de Beatriz Nunes? Você precisará avisá-la pelo celular.` |
| `Editar nome e idade` | not cancelled | inline in the detail panel |
| `Cancelar inscrição` | not cancelled | `Cancelar a inscrição de Ana Paula Ribeiro? A vaga será liberada.` |
| `Excluir definitivamente` | always | **destructive** — see § 4.5 |

`Confirmar vaga` on a specific person and `Promover próximas N` on the dashboard both go through
`promote_from_waitlist` semantics and are both capacity-checked in the database. Promoting out of
order is allowed — an organizer may know that a particular person can definitely attend — and the
stored `waitlist_rank` keeps the record of what actually happened.

**Editing.** A correction goes through the `edit_registration()` RPC, not a direct table write
([DATABASE-SECURITY.md § 6.3](./DATABASE-SECURITY.md)). Consequences visible in the UI:

- Only `full_name`, `age` and `notes` can be changed — they are the RPC's only parameters, and
  `authenticated` holds no `UPDATE` privilege on the table at all.
- The phone number is **not** editable: it is the identity key and the duplicate key, so changing it
  would silently move the registration to a different person. To fix a wrong number, cancel and
  re-register.
- Status is not editable here; use `Cancelar inscrição` or `Confirmar vaga`.
- Saving with no actual change is a no-op: no write, and no audit entry.
- Every real change is audited **in the same transaction**, recording which fields changed —
  `full_name`, `age`, `notes` — and never the old or new values, which are participant personal data.

### 4.5 Destructive actions

`Excluir definitivamente` is the only irreversible action in the product. It exists because the right
to erasure requires it, and it is deliberately separate from `Cancelar`.

> ### Excluir definitivamente
> Isto apaga o nome, a idade e o celular de **Ana Paula Ribeiro** do banco de dados. **Não é
> possível desfazer.**
>
> Para cancelar a participação sem apagar os dados, use **Cancelar inscrição**.
>
> ☐ Entendo que esta ação é permanente
>
> `[ Cancelar ]` `[ Excluir definitivamente ]`  ← disabled until the box is ticked

- The confirm button is a distinct destructive style and is genuinely disabled until the checkbox is
  ticked. This is the one place a `disabled` control is correct: the action is not available yet, and
  the checkbox explains why.
- Typing the person's name to confirm was rejected — that pattern is for irreversible infrastructure
  actions, and here it would make a legitimate privacy request tedious enough to discourage.
- No bulk delete. Erasure is per-person and deliberate. The only bulk operation in the product is
  `Promover próximos N`, which is non-destructive, and the end-of-life `Encerrar evento e apagar
  dados` (§ 6.4).
- Audited as `registration.deleted` with no personal data in the metadata.

### 4.6 Export

A `Exportar CSV` button in the page header. It exports **exactly the current filter and search**, and
says so: `Exportar 12 resultados`. Exporting whatever is on screen is predictable; a hidden
"export everything" is not.

A one-line notice sits beside it: `O arquivo contém dados pessoais. Guarde com cuidado.`

Technical requirements — BOM, `;` delimiter, formula-injection guard, `no-store`, audit entry — are
specified in [DATABASE-SECURITY.md § 10](./DATABASE-SECURITY.md).

---

## 5. Settings — `/admin/configuracoes`

Three settings and a read-only block. Nothing else.

### 5.1 Editable

**Capacidade**

> `Capacidade` [ 80 ]
> Número máximo de inscrições confirmadas.
> Mínimo permitido agora: **78** (inscrições já confirmadas).

- `inputmode="numeric"`.
- Client-side, entering a value below `confirmed_count` shows the error immediately.
- Server-side, `update_event_settings` rejects it regardless, with
  `Não é possível definir a capacidade abaixo de 78 inscrições confirmadas. Cancele inscrições primeiro.`
- **Capacity `0` cannot be combined with `Inscrições: Abertas`.** Attempting to save that
  combination — in either direction — is refused with
  `Defina a capacidade antes de abrir as inscrições.` The `Abertas` option is disabled while the
  capacity field holds `0`, with that sentence as its explanation, so the refusal is anticipated
  rather than discovered on save. Enforced by a database constraint as well
  ([DATABASE-SECURITY.md § 6.6](./DATABASE-SECURITY.md), **I7**).
- After an increase that creates headroom while people are queued, the success message carries the
  next action: `Capacidade atualizada. Há 20 vagas livres e 12 pessoas na lista de espera.
  [ Promover próximas 12 ]`

**Lista de espera**

> `Lista de espera` [ ●── ] Ativada
> Quando as vagas acabarem, novas inscrições entram na lista de espera.

With the waitlist off and people queued, the helper text states the consequence exactly:
`12 pessoas já estão na lista e continuam podendo ser promovidas. Apenas novas inscrições serão
recusadas.`

**Inscrições**

> `Inscrições` ( **Abertas** | Encerradas )
> Encerrar interrompe novas inscrições imediatamente, independentemente da capacidade.

### 5.2 Read-only

Event copy — title, date, time, venue, address, price label — is displayed but not editable in V1.
Beneath it:

> Estas informações vêm da configuração do evento. Para alterá-las, fale com quem mantém o sistema.

This is a deliberate scope boundary ([PRODUCT-SPEC.md § 3.2](./PRODUCT-SPEC.md)). The columns already
exist in `events`, so exposing them later is a UI change with no schema work — but building a copy
editor now would turn a registration product into a content management system.

### 5.3 Saving

- One `Salvar alterações` button. The form is not auto-saving: capacity and open/closed are
  consequential enough to deserve a deliberate commit.
- The button is inert until something changes.
- **Optimistic concurrency:** the form carries the `settings_version` it loaded and sends it back
  with the save. If it no longer matches, the save is rejected with
  `As configurações foram alteradas por outra pessoa. Recarregue a página para ver os valores
  atuais.` and a `Recarregar` button. Nothing is silently overwritten. Each successful save returns
  the new `settings_version`, so a second edit in the same sitting does not need a page reload.

  **This token counts administrator settings changes only.** Registrations, cancellations and
  promotions do **not** advance it, so an administrator can leave the settings page open all evening
  while the event fills up and still save without a spurious conflict. An earlier revision used the
  event row's `updated_at`, which the counter trigger bumps on every registration — that produced
  exactly the false conflict this design removes
  ([DATABASE-SECURITY.md § 6.4](./DATABASE-SECURITY.md), **I8**).
- Every change is audited as a single `settings.updated` record, in the same transaction as the
  change, carrying the previous and new values of all three settings.
- Every successful save triggers `revalidatePath('/')`.

---

## 6. Team — `/admin/equipe`

### 6.1 List

| Nome | E-mail | Situação | Desde | |
| --- | --- | --- | --- | --- |
| Igor Felipe (você) | igor@… | ● Ativo | 12/08/2026 | — |
| Marina Alves | marina@… | ● Ativo | 20/08/2026 | ⋯ |
| Pedro Santos | pedro@… | ○ Desativado | 01/09/2026 | ⋯ |

### 6.2 Invite

> `[ + Convidar organizador ]`
>
> ### Convidar organizador
> `E-mail` [ ______________________ ]
> A pessoa receberá um convite por e-mail e poderá entrar com um código. Organizadores têm acesso
> total às inscrições, incluindo dados pessoais.
> `[ Cancelar ]` `[ Enviar convite ]`

The warning about full access is not decoration — it is the only place the consequence of the
flat permission model is stated, and inviting someone is a security decision.

Server-side: `assertAdmin()` → `auth.admin.inviteUserByEmail()` with the secret key → insert into
`admin_users` → audit `admin.invited`. If the address already exists in `auth.users`, skip the invite
and insert only the `admin_users` row. Feedback is honest either way:
`Convite enviado para marina@exemplo.com.` / `Essa conta já existia e agora tem acesso.`

### 6.3 Deactivate and remove

| Action | Effect |
| --- | --- |
| `Desativar` | `is_active = false`, applied and audited in one transaction. Access ends on their next request. The row is kept, so the audit trail keeps a name. Reversible with `Reativar`. |
| `Remover definitivamente` | Two steps, database first: the `admin_users` row is deleted and audited in one transaction (authorization is revoked at that instant), then the `auth.users` account is deleted through the Auth Admin API. |

`Desativar` is presented as the primary option and `Remover definitivamente` sits behind the `⋯`
menu, because deactivation is almost always what is actually wanted.

**Removal spans two systems and cannot be one transaction.** If the second step fails, the person is
already not an administrator — authorization lives in `admin_users`, never in Auth — so the failure
mode is closed, not open. The Team page surfaces the residue honestly:
`Acesso revogado, mas a conta de autenticação ainda existe. Tentar remover novamente.` Retrying is
safe. See [DATABASE-SECURITY.md § 6.7](./DATABASE-SECURITY.md).

**After a permanent removal, past audit records show `actor_user_id = NULL`.** That is a valid,
meaningful state — *an administrator who has since been removed* — not corrupt data. Any interface
or query that reads the audit log renders it as `Organizador removido (<nome>)` using the
`actor_label` snapshot captured when the action happened, and must `LEFT JOIN` to `admin_users`; an
inner join would silently hide exactly the history most worth keeping
([DATABASE-SECURITY.md § 3.6](./DATABASE-SECURITY.md)).

Two guards, enforced inside the RPC rather than only in the UI:

- You cannot deactivate or remove yourself. `Você não pode remover seu próprio acesso.`
- The last active administrator cannot be deactivated or removed.
  `É necessário manter pelo menos um organizador ativo.`

### 6.4 End of event

At the bottom of the Team page, visually separated, a `Zona de risco` block:

> ### Encerrar evento e apagar dados
> Apaga permanentemente **todas** as inscrições deste evento — nomes, idades e celulares. Use isto
> quando o evento tiver terminado e os dados não forem mais necessários.
>
> Inscrições que serão apagadas: **90**
> (78 confirmadas · 9 na lista de espera · 3 canceladas)
>
> As inscrições também serão **encerradas**, para que o evento não volte a coletar dados.
>
> ☐ Entendo que esta ação é permanente
> `[ Apagar todas as inscrições ]`  ← disabled until the box is ticked

This is the retention mechanism ([DATABASE-SECURITY.md § 12](./DATABASE-SECURITY.md)). A human
confirming the deletion is more appropriate than a silent scheduled job for a one-off event, and it
produces an audit record (`registrations.purged`) that a scheduled job would not attribute to anyone.

Behaviour the interface must reflect:

- **One atomic operation.** A single call to `purge_event_registrations()`
  ([DATABASE-SECURITY.md § 6.5](./DATABASE-SECURITY.md)) — never a loop issuing one delete per
  participant. There is no progress bar, because there are no intermediate states: either every
  registration is gone or none is.
- **Registrations are forced closed** as part of the same operation, and the copy says so **before**
  the button is pressed. A purged event that kept accepting registrations would begin re-collecting
  personal data immediately.
- **Optimistic concurrency applies here too.** The confirmation screen carries the
  `settings_version` it loaded; if another administrator changed settings meanwhile, the purge is
  refused with the same `As configurações foram alteradas por outra pessoa…` message. The most
  destructive action in the product does not run against a stale view.
- **Counts are shown, and they are exact** — read in the same transaction that performs the delete,
  then reported back: `90 inscrições apagadas.`
- **Repeating it is safe.** A second purge deletes nothing and reports `0 inscrições apagadas.`
- **The audit record survives** and contains only counts. Afterwards the Team page shows
  `Dados apagados em 19/12/2026 por Igor Felipe — 90 inscrições.`
- Afterwards the dashboard returns to its empty state with both counters at zero and registrations
  closed.

---

## 7. States

### 7.1 Loading

- Route-level `loading.tsx` for `/admin`, `/admin/inscricoes`, `/admin/configuracoes`.
- Skeletons must match the final layout's dimensions exactly, or they trade a spinner for layout
  shift. Table skeleton: eight rows at 40 px with grey blocks at the real column widths.
- Server Action pending states are inline on the control that triggered them: the button shows a
  spinner and `aria-busy="true"`, never a full-page overlay.
- Search results use `useTransition`, so the existing rows stay visible at reduced opacity while the
  new page loads. Blanking the table on every keystroke would make search feel broken.

### 7.2 Empty

| Situation | Message |
| --- | --- |
| No registrations at all | **Ainda não há inscrições.** Assim que alguém se inscrever, as informações aparecem aqui. `[ Ver página pública ]` |
| Search returns nothing | **Nenhuma inscrição encontrada para «beatriz».** `[ Limpar busca ]` |
| Status filter is empty | **Nenhuma inscrição com este status.** `[ Ver todas ]` |
| Waitlist empty (dashboard) | The waitlist number reads `0` and the promotion prompt is simply absent. No empty-state illustration. |
| Only one administrator | The team list shows the single row. No empty state — there is always at least one administrator. |

Empty states always carry the action that resolves them. No illustrations, no mascots.

### 7.3 Errors

| Situation | Behaviour |
| --- | --- |
| Session expired mid-session | The Server Action returns an unauthorized result; the UI shows `Sua sessão expirou. Recarregue a página para entrar novamente.` with a `Recarregar` button. **Never** silently discard the administrator's unsaved input. |
| Not an administrator | `/admin/sem-acesso` (§ 2). |
| Settings conflict | § 5.3. |
| Promotion returned fewer rows than requested | `Apenas 1 de 2 pessoas foi promovida — não havia mais vagas.` |
| Capacity below confirmed | § 5.1. |
| Export fails | `Não foi possível gerar o arquivo. Tente novamente.` plus a correlation code. |
| Unexpected server error | `error.tsx` boundary: `Algo deu errado.` a `Tentar novamente` button, and a short correlation code in small type. **No stack trace, no SQL, no table name.** |
| Database unreachable | Same boundary. The dashboard's numbers are never rendered as `0` when they are actually unknown — an unknown value renders as `—`. Showing `0 confirmadas` during an outage would be worse than showing nothing. |

That last rule matters: an organizer who sees `0 confirmadas` will act on it.

---

## 8. Accessibility

Beyond the global requirements in [VISUAL-DIRECTION.md § 13](./VISUAL-DIRECTION.md):

- **Table semantics.** One `<table>` with a `<caption>` (visually hidden), `<th scope="col">` on
  every header, and `aria-sort` on sortable headers. Sorting controls are `<button>` elements inside
  the `<th>`.
- **Dialogs.** Native `<dialog>` with `showModal()` for detail panels and confirmations — focus
  trapping, Escape and background inert come from the platform. Focus returns to the triggering
  element on close.
- **Live regions.** Search result counts are announced with `aria-live="polite"` on the count
  element, not on the table. Announcing the whole table on every keystroke is unusable.
- **Action feedback.** Every completed action announces its result through a `role="status"` region:
  `Inscrição de Ana Paula Ribeiro cancelada.`
- **Status pills** always carry their text label.
- **The capacity meter** is `role="img"` with a full-sentence `aria-label` (§ 3.2).
- **Touch targets** ≥ 44 × 44 px throughout, including the `⋯` menu trigger and the bottom tab bar.
- **Keyboard.** Every action is reachable without a pointer. The `⋯` menu opens on Enter/Space,
  closes on Escape, and moves focus through its items with arrow keys.
- **Focus visibility.** Table rows are not themselves focusable; the actions button is. A focused
  control inside a scrolled table must never be obscured — `scroll-margin` on focusable cells.
- **Contrast.** All admin status colours meet 4.5:1 on white
  ([VISUAL-DIRECTION.md § 12](./VISUAL-DIRECTION.md)).

## 9. Mobile behaviour

The admin is a real mobile product, not a shrunken desktop one.

| Aspect | Behaviour |
| --- | --- |
| Navigation | Bottom tab bar, four items, respecting `env(safe-area-inset-bottom)` |
| Dashboard | The three numbers on one row, the meter below, the promotion prompt full-width and prominent |
| List | Priority columns plus the row detail dialog (§ 4.3) |
| Actions | Full-width buttons ≥ 48 px inside the detail dialog |
| Phone numbers | `tel:` links throughout — the list becomes a dialer, which is the actual mobile use case |
| Search | Sticky below the top bar so it stays reachable while scrolling |
| Settings | Single column; the numeric input opens the numeric keypad |
| Export | Available on mobile; the browser handles the download |
| Density | Row height stays 40 px, but the tap target is the full row via the detail dialog |

## 10. Explicitly excluded

Enterprise features that a small volunteer team would have to navigate around rather than benefit
from:

- Role hierarchies, granular permissions, per-field access control.
- Registration approval workflows.
- Bulk edit, bulk cancel, bulk delete.
- Saved views, custom columns, column reordering.
- A notification centre, an activity feed, real-time presence.
- Charts beyond the capacity meter.
- Comments or internal discussion threads on a registration.
- Import from CSV.
- Multi-event switching, event creation, event duplication.
- An admin API, webhooks, integrations.
- A theme switcher.

The audit log is **stored** but not surfaced as a browsable admin page in V1. It exists to answer
questions after the fact — read via SQL when needed — and giving it a UI would add a fifth
destination that nobody would visit during normal operation.
