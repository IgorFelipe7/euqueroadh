# Event — Source of Truth

**Authoritative source:** `references/event/banner-original.png` (1080 × 1440 px, PNG)

This document is a transcription and interpretation of the **only** factual source for this event.
Nothing in `references/visual/` is factual evidence about the event — those files are aesthetic
references only (see [VISUAL-DIRECTION.md](./VISUAL-DIRECTION.md)).

Every line below is marked:

| Mark | Meaning |
| --- | --- |
| **CONFIRMED** | Literally legible in the banner. Safe to publish. |
| **CONFIRMED (organizer)** | Not in the banner, but explicitly answered by the organizers. Safe to publish. |
| **INFERRED** | Not stated; derived with supporting reasoning. **Must be confirmed before publishing.** |
| **UNRESOLVED** | Not present in the source at all. Must be supplied by the organizers. |

---

## 1. Identity

| Field | Value | Status |
| --- | --- | --- |
| Format | `PALESTRA` | CONFIRMED |
| Theme | `EDUCAÇÃO FINANCEIRA` (rendered as `educação` / `Financeira`) | CONFIRMED |
| Audience qualifier | `PARA JOVENS` | CONFIRMED |
| Full display name | `Palestra — Educação Financeira para Jovens` | CONFIRMED (composition of the three lines above) |

The banner sets no separate "brand name" for the event. `Educação Financeira para Jovens` is the
event's name; `Palestra` is its format and functions as a kicker/eyebrow.

## 2. Date and time

| Field | Value | Status |
| --- | --- | --- |
| Day / month | `19 SET` → **19 de setembro** | CONFIRMED |
| Year | **2026** | **CONFIRMED (organizer)** — not printed on the banner; answered by the organizers |
| Start time | `19:00` (banner: `DAS 19:00HS`) | CONFIRMED |
| End time | `21:00` (banner: `ÀS 21:00HS`) | CONFIRMED |
| Duration | 2 hours | CONFIRMED (derived arithmetically) |
| Time zone | `America/Sao_Paulo` | CONFIRMED (organizer) |
| Weekday | **sábado** (Saturday) | Derived from the confirmed date |

**Canonical event datetime — use this verbatim when seeding the database:**

```
starts_at : 2026-09-19T19:00:00-03:00
ends_at   : 2026-09-19T21:00:00-03:00
timezone  : America/Sao_Paulo
```

`-03:00` is São Paulo's offset on that date. Brazil has not observed daylight saving time since
2019, so the offset is stable; store both values as `timestamptz` and format for display with
`Intl.DateTimeFormat` bound to `America/Sao_Paulo` rather than hard-coding the offset in the UI.

Public display forms: `19 de setembro de 2026`, `sábado, 19 de setembro`, `19h às 21h`.

The year was **not** printed anywhere on the banner and was supplied separately by the organizers.
This resolves what was previously tracked as Q1.

## 3. Registration and inclusions

| Field | Value | Status |
| --- | --- | --- |
| Price | `INSCRIÇÕES GRATUITAS` — free of charge | CONFIRMED |
| Included | `COFFEE BREAK INCLUSO` | CONFIRMED |
| Registration channel | **none printed** — no URL, QR code, phone number or @handle appears on the banner | UNRESOLVED |
| Capacity | **not printed** | UNRESOLVED — admin-configurable by design (see [PRODUCT-SPEC.md](./PRODUCT-SPEC.md)) |
| Registration deadline | **not printed** | UNRESOLVED |

## 4. Venue

| Field | Value (transcribed exactly as printed) | Status |
| --- | --- | --- |
| Venue name | `ESPAÇO CEZANNE EVENTOS` | CONFIRMED |
| Street | `R. José Possidonio Silva, 435` | CONFIRMED |
| District | `Jardim Adelaide` | CONFIRMED |
| City / state | `Hortolândia/SP` | CONFIRMED |
| CEP (postal code) | not printed | UNRESOLVED |

> **Transcription note:** the banner prints `Possidonio` **without** a circumflex. Brazilian street
> registries commonly spell this name `Possidônio`. **Publish exactly what the banner prints**
> (`R. José Possidonio Silva, 435`) unless the organizers confirm the accented spelling. Do not
> "correct" a proper name silently.

## 5. Organizers and supporters

`REALIZAÇÃO:` (organizers) — three logos, in banner order:

1. `MARCADOS PELA GRAÇA` — wordmark set in two lines, `PELA` in yellow. Mark: a stylised
   tower/fortress with a yellow flame above it.
2. `MINISTÉRIO TEEN` — same tower motif with a cross, yellow flame above.
3. `ASSEMBLEIA DE DEUS / MINISTÉRIO DO BELÉM / EM HORTOLÂNDIA` — tower mark plus three lines of
   type; line 2 (`MINISTÉRIO DO BELÉM`) is yellow.

`APOIO:` (supporter) — one logo:

4. `Sicredi` — wordmark plus the Sicredi pinwheel mark. Separated from the `REALIZAÇÃO` group by a
   vertical rule.

All four appear **reversed in white/yellow on a solid blue panel** at the foot of the banner.

**Status:** all four names CONFIRMED. Relationship (`REALIZAÇÃO` vs `APOIO`) CONFIRMED.

## 6. Imagery and graphic content

| Element | Description | Status |
| --- | --- | --- |
| Photography | Two smiling young people (one in a denim jacket, one in a black t-shirt with folded arms), cut out and placed bleeding off the right edge, occupying roughly the right 45% of the lower half | CONFIRMED (present in the composite) |
| Background motif | A large, low-contrast **financial line chart with volume bars**, in blue on navy, behind the headline | CONFIRMED |
| Secondary shapes | Soft organic blue blobs at mid-left and mid-right; a circular white map-pin icon; a large rounded pill behind `PARA JOVENS`; a large rounded panel behind the logo bar | CONFIRMED |
| Texture | Visible film grain / noise across the whole artwork | CONFIRMED |

## 7. Measured colour values

Sampled directly from the PNG (median-cut quantisation plus targeted glyph sampling):

| Role in the banner | Hex | Share of canvas |
| --- | --- | --- |
| Brand blue (pill, logo panel) | `#1656C4` | 16.4% |
| Mid navy | `#0D2369` | 11.5% |
| Pale blue-white (`SET`, body lines) | `#D4E7EF` | 11.0% |
| Deepest navy (background base) | `#0C1334` | 10.9% |
| Deep blue (chart field) | `#0E1C4F` | 6.1% |
| Light blue (`PALESTRA` display type) | `#71C1FC` | — (measured on glyphs) |
| Yellow accent (`GRATUITAS`, `COFFEE BREAK`) | `#FFC400` | — (measured on glyphs) |
| White | `#FFFFFF` | — |

The remaining quantised buckets (`#2D2837`, `#A09599`, `#212542`…) are photographic mid-tones from
the people and the grain, not identity colours. Colour interpretation is in
[VISUAL-DIRECTION.md § 3](./VISUAL-DIRECTION.md).

## 8. Typography observed in the banner

This is an observation of characteristics to be **translated**, not a font identification:

- `PALESTRA` — heavy, wide, geometric sans in all caps, tight tracking, light blue.
- `educação` — light/regular geometric sans, lowercase, white. Deliberate weight contrast against
  the line below.
- `Financeira` — very heavy, wide, geometric sans, mixed case, white, tight tracking. The dominant
  element on the page.
- `PARA JOVENS` — medium weight, all caps, **very wide letter-spacing**, inside a pill.
- `19SET` — very large; `19` heavy and slightly narrow, `SET` lighter and wider, both in a grotesque
  with condensed proportions. The numerals anchor the lower half of the composition.
- Info lines (`INSCRIÇÕES GRATUITAS`, `DAS 19:00HS…`, `COFFEE BREAK INCLUSO`) — bold condensed caps,
  tightly stacked, separated by thin rules.
- Venue block — bold caps for the venue name, regular weight for the address lines.

The identity therefore rests on **three** typographic devices: (a) extreme weight contrast,
(b) width contrast (wide display versus condensed numerals), (c) all-caps wide-tracked labels.

---

## 9. Unresolved facts — consolidated

**Resolved since the first revision:** the **event year is 2026** (§ 2). No item below blocks
implementation; the blocking column states what each one actually holds up.

| # | Unknown | Blocks | Impact if missing or wrong |
| --- | --- | --- | --- |
| 1 | **Data controller identity** — which of the three `REALIZAÇÃO` entities is legally responsible for the personal data collected | Launch | The privacy notice cannot be written. |
| 2 | **Contact channel for data-subject requests** (phone, e-mail or WhatsApp) | Launch + degrades three strings | Participants have no way to exercise their rights or correct their data, and there is no channel to notify waitlist promotions. |
| 3 | **Retention period** for registration data after the event | Launch | No defensible deletion rule. Recommended default: 90 days. |
| 4 | **Under-18 participation and privacy handling** | Launch | The event is `para jovens` and the product stores age. See [PRODUCT-SPEC.md § 12.1](./PRODUCT-SPEC.md). |
| 5 | **Capacity** of Espaço Cezanne Eventos for this event | Launch only | The event is seeded `closed` with `capacity = 0` and **cannot be opened** until a real capacity is set, so a forgotten placeholder fails safe rather than mis-serving visitors. |
| 6 | Speaker (`palestrante`) name and credentials | One optional section | The page cannot answer "who is speaking?", a genuine conversion factor. |
| 7 | Whether an age restriction applies (`jovens` is not a numeric rule) | Nothing | Only technical plausibility bounds are applied. See [PRODUCT-SPEC.md § 4.3](./PRODUCT-SPEC.md). |
| 8 | Registration deadline / closing date | Nothing | Registrations are closed manually by an admin in V1. |
| 9 | CEP of the venue | Nothing | Slightly degrades the accuracy of the "Como chegar" map link. |

## 10. Assets still needed

| Asset | Needed for | Fallback if unavailable |
| --- | --- | --- |
| High-resolution **cut-out** of the two people (transparent PNG, ≥ 1600 px tall) plus confirmation of image rights | Promoting the photograph into the hero | Build the hero typographically and present `banner-original.png` as a poster further down the page. **This is the specified default** — see [VISUAL-DIRECTION.md § 8](./VISUAL-DIRECTION.md). |
| Vector (SVG) logos for `Marcados pela Graça`, `Ministério Teen`, `Assembleia de Deus — Ministério do Belém em Hortolândia`, `Sicredi` | Crisp reversed logo bar at any size | Crop from the banner at 3× and ship as WebP; visibly softer on desktop. |
| Written permission to display the `Sicredi` mark on the web | Legal correctness of the `APOIO` row | Render `Apoio: Sicredi` as text only. |
| Venue photograph or a static map image | Enriching the venue block | Address block plus a "Como chegar" link only (the specified default). |

`references/event/banner-original.png` must never be modified, cropped in place, or overwritten.
Derived assets belong in the application's own asset directory.
