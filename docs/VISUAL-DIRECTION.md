# Visual Direction & Interaction Specification

Art direction for *Palestra — Educação Financeira para Jovens*.

The identity comes from `references/event/banner-original.png`. The files in `references/visual/`
supply **principles of craft** — composition, hierarchy, restraint, presentation — and supply
**nothing factual and no visual identity**. Nothing here is a clone of any reference.

Colour and type values measured from the banner are in
[EVENT-SOURCE-OF-TRUTH.md § 7–8](./EVENT-SOURCE-OF-TRUTH.md).

---

## 1. Reference analysis

Each reference is read twice: **what it teaches**, then **what we actually take**. The second column
is deliberately much smaller than the first. That gap is the discipline of this document.

### 1.1 `apple-imac.webp` — Apple iMac product page

**Observed.** Pure white field. A centred stack: product name (`iMac`), then an oversized one-word
headline (`Bri||||||iant.`) whose only ornament is the rainbow stripe replacing the `ll`, then the
product line-up photographed as a single wide object, then a colour sub-line, then one blue pill CTA,
then price and availability in small dark type. Enormous vertical breathing room — roughly a third of
the frame is empty. Type is Apple's own grotesque at a huge size with tight tracking and a very
tight line-height. Exactly one saturated colour in the interface (the CTA blue); all other colour
comes from the product itself.

**What we learn.** (a) A single wide "hero object" plus a short headline can carry an entire page —
no supporting card grid is needed. (b) Colour earns attention because it is rationed: one blue pill
in a white field is unmissable. (c) Commercial detail (price, date) sits *below* the CTA in small
type and does not compete. (d) Whitespace is the primary luxury signal — cheaper than any effect.
(e) One clever typographic idea, applied once, does more than a dozen decorative flourishes.

**What we take.** Colour rationing (exactly one CTA colour, § 3.4). Commercial line placed under the
CTA (`Inscrição gratuita · Coffee break incluso`). A single hero object rather than a card grid.
Generous vertical rhythm (§ 4).

**What we reject.** Centred composition (our headline is a three-line lockup that reads better
left-aligned — see § 1.3 and § 5.1). White field (the event identity is dark). A per-variant colour
system — this event has one identity, not seven finishes.

### 1.2 `apple-macbook-pro.webp` — Apple MacBook Pro, dark treatment

**Observed.** Near-black field. Small product name in white, then a headline (`Hello, Apple
Intelligence.`) whose glyphs *emit* a blue→magenta→amber glow, then the laptop shot from a low angle
with the keyboard rim lit in the same gradient. The glow is not a CSS effect applied to text — it is
the photograph's light source continued upward into the type, so the headline and the product share
one lighting model. Body copy is mid-grey, not white, holding the hierarchy. Same blue pill CTA.

**What we learn.** This is the single most useful reference in the set. **Depth on a dark page comes
from a coherent light source, not from layered translucent panels.** One implied light, consistent
across type and object, reads expensive. Add a second, unrelated glow and it reads like a template.
Also: secondary text at mid-grey rather than white is what makes the headline feel bright.

**What we take.** The dark field as the base (§ 3.1). One coherent light source: a single soft radial
glow behind the hero headline in the banner's own light blue, with the chart motif brightest at that
same point (§ 7). Tiered text colour — white headline, `#D4E7EF` secondary, `#9FB3D9` muted (§ 3.3).

**What we reject.** Literal neon-glow text. On a saturated navy it turns to mud, it costs contrast we
need for accessibility, and animated glow is exactly the "tech gradient" cliché the brief prohibits.
Our glow is *behind* the type, never *on* it.

### 1.3 `Brand.png` — Tonemaki

**Observed.** Near-black textured field. Strongly **asymmetric**: left column holds a two-line
display headline in heavy condensed caps, split across two colours (`LET'S FEED` in coral, `YOUR
BRAND` in cream); beneath it a one-line subhead where key phrases are bolded inline; beneath that a
saturated green pill CTA. The right column holds a phone render, angled, cropped by the frame. A row
of five client logos sits along the bottom edge in a muted single tone. The logo mark is a small
wordmark in a rough stamped box.

**What we learn.** The closest structural analogue to what this page needs. (a) An asymmetric
type-left / object-right hero is more confident and more readable than a centred one, and it gives
long Portuguese words room to breathe. (b) **Splitting a headline across two colours creates
hierarchy inside a single sentence** — precisely what the banner already does with `educação` /
`Financeira`. (c) A muted logo row along the bottom edge reads as credibility, not as clutter. (d)
Bolding a phrase inside a sentence directs the eye more cheaply than adding a badge.

**What we take.** The asymmetric hero on desktop (§ 5.1). Two-tone headline, using the banner's own
white/light-blue relationship (§ 2.2). **The bottom logo row** — this is not borrowed styling, it is
the structure the banner itself already uses for `REALIZAÇÃO` / `APOIO`, and the reference confirms
it works on the web (§ 5.1, § 8.3). Inline emphasis in the subhead rather than badges.

**What we reject.** Coral and mint green. The stamped/rough logo treatment (wrong register for a
church-organized educational event). The floating phone render — we have no app to show.

### 1.4 `lemon-squeezy.webp` — Lemon Squeezy

**Observed.** A single flat saturated violet covering the entire viewport — no gradient, no image
background. A four-line headline in white at very large size with generous line-height, wrapped
early to a narrow measure. Two lines of subhead at ~55% opacity. One white pill CTA with an arrow.
A dashboard screenshot enters from the right at a perspective angle, cropped hard by the viewport
edge. Bottom left: `TRUSTED BY THOUSANDS OF COMPANIES GLOBALLY` in small wide-tracked caps, beside a
row of client logos.

**What we learn.** (a) **A single confident flat colour beats a gradient.** No blobs, no mesh — one
brand colour, full bleed. (b) Deliberately wrapping a headline to a narrow measure makes large type
feel composed rather than sprawling. (c) A small wide-tracked caps label is an extremely efficient
way to label a region without a heading or a badge. (d) An object cropped by the viewport edge
implies the page continues beyond the frame — depth for free.

**What we take.** Flat colour fields, zero decorative gradients (§ 3.2). A hard `max-width` in `ch`
on the headline to control wrapping (§ 2.4). Wide-tracked caps micro-labels for `Realização`,
`Apoio`, `Detalhes` and the form's field group — which is also exactly how the banner labels its own
logo bar (§ 2.3). Edge-cropped hero object (§ 8.1).

**What we reject.** Violet. Perspective-transformed screenshots. `TRUSTED BY THOUSANDS` — we have no
such claim and will not manufacture one.

### 1.5 `linkkit.webp` — Linkkit

**Observed.** Off-white field, extreme restraint. A small pill-shaped header bar containing only a
wordmark and one button. Then a very large amount of empty space. Then a two-line centred headline in
plain black grotesque with no colour, no accent, no ornament. Then more empty space. Then a single
phone render, floating at a dramatic isometric angle, casting a large soft shadow onto the ground
plane. The phone's own screen supplies the only colour on the page. Nothing else exists.

**What we learn.** (a) **Confidence is what you leave out.** With one object and one sentence, every
addition would be a subtraction. (b) A large soft ground shadow is enough to establish depth — no
3D, no WebGL, no layered glass. (c) A pill-shaped, inset header (rather than a full-width bar) makes
the page feel like an object rather than a document.

**What we take.** The editorial willingness to leave large areas empty (§ 4). **Object plus soft
ground shadow as the entire depth model** for the poster presentation (§ 8.2) — this is the specific
technique that lets us avoid WebGL entirely. Restraint as the default answer.

**What we reject.** The near-empty page — we have real information to deliver (date, venue, price,
form) and hiding it below three viewports would harm conversion. Centred type. Off-white.

### 1.6 `Otherlife.png` — Otherlife (a MoonPay company)

**Observed.** A warm grey-taupe field. A photoreal 3D scene of mossy boulders floating in space,
arranged in a rough ring around a phone that is partly *occluded* by the rocks — some in front, some
behind. Small debris pebbles scattered outward. A serif wordmark top-left; a white pill and a
saturated green button top-right. Almost no typography.

**What we learn.** (a) **Occlusion is the strongest depth cue available** — an object passing *in
front of* another reads as real space far more convincingly than any blur or shadow. And occlusion is
free: it is `z-index` plus a mask. (b) An unexpected neutral (taupe, not black or white) makes a
page memorable. (c) A saturated accent placed on a neutral field carries enormous weight.

**What we take.** **Occlusion, achieved in 2D.** The chart motif passes behind the headline while a
foreground element (the poster's corner, the pill lockup) passes in front of it, establishing three
depth planes with plain CSS stacking (§ 7.2). This is the reference's real lesson, extracted from its
3D packaging.

**What we reject.** Everything else. 3D rendering, floating rocks, the taupe palette, the
near-typeless composition. A rendered scene would be the most expensive possible way to add nothing
to a registration form, and the brief explicitly forbids 3D-for-its-own-sake.

### 1.7 `roasti.webp` — Roasti

**Observed.** Near-black with a faint dark-red radial vignette and small scattered ember particles.
A two-line headline in white where two words are wrapped in **Figma-style selection frames** —
labelled handles, coloured borders, small `Designer` / `You` cursor tags. Below: subhead, an
outlined (not filled) pill CTA in orange, and a small `10+ ✳ Years of experience` line. Further down,
a browser mock annotated with orange comment bubbles containing real CSS.

**What we learn.** (a) The headline's ornament is *the product's own subject matter* — a design
critique tool decorates its headline with design-tool chrome. Decoration that carries meaning stops
being decoration. This is the test every ornament on our page must pass. (b) An outlined CTA is
quieter than a filled one — useful for a secondary action. (c) A radial vignette focuses attention
on a dark page at essentially no cost.

**What we take.** The **meaning test** for ornament: our only decorative element is the financial
chart, which is the event's own subject (§ 7.1). A subtle radial vignette to focus the hero (§ 7.3).
Outlined style for secondary actions only (§ 3.5).

**What we reject.** Ember particles (animated decorative noise, banned by the brief). The
annotation-bubble device. The `10+ years` stat — a manufactured number of exactly the kind we must
not invent.

### 1.8 `spline.webp` — Spline

**Observed.** Near-black. A centred two-line headline, a row of three checkmark feature words
(`Web-Based · Real-time · Collaborative`), a blue pill CTA. Filling the lower two-thirds: an
interactive isometric 3D scene — violet tiles, green cones, an amber icosahedron, a low-poly rabbit —
with a small `Press and drag to orbit` hint pill. The CTA sits **on top of** the 3D scene.

**What we learn.** Mostly a warning. This page's 3D is legitimate — the product *is* a 3D editor, so
the hero is a live demo. Our page is not. Two transferable points: (a) the hint pill (`Press and drag
to orbit`) is a good pattern for making an interaction discoverable; (b) placing the CTA over the
visual keeps action and atmosphere in one glance.

**What we take.** Almost nothing. The CTA-over-atmosphere overlap (our CTA sits over the chart
motif's glow, § 5.1). Nothing else.

**What we reject and why it matters most here.** The entire 3D approach. If our page shipped a
WebGL scene it would be decoration justified by nothing, it would dominate LCP and mobile memory on
exactly the low-end Android devices our audience uses, and it would violate the rule that core event
information must never depend on WebGL. **The presence of 3D in this reference is the single
strongest temptation in the set, and it is refused.** Also refused: the three checkmark feature
words, which are a hair's breadth from the "three generic cards" anti-pattern.

### 1.9 `WatchUltra.png` — Apple Watch Ultra 3 (Brazilian store, pt-BR)

**Observed.** Black field. The watch photographed enormous and **cropped by three edges of the
frame** — it does not fit, and that is the point. Type is pushed into the bottom-left corner:
`WATCH ULTRA 3` in small tracked caps, then `Imparável.` — one word, one period — then the price line
in small bold type. The `Comprar` CTA sits alone in the bottom-right corner, far from the type. Text
occupies maybe 15% of the frame.

**What we learn.** (a) **Cropping an object past the frame edge makes it feel larger than the
screen.** (b) A one-word headline with a full stop is the most confident possible statement — and
`Imparável.` shows this works in Portuguese, where words are longer than in English. (c)
Corner-anchoring type against a large object is a composition, not a layout. (d) This is a rendered
pt-BR page in the reference set: it confirms that a long-word language does not require shrinking
type, only controlling the measure.

**What we take.** The **oversized, edge-cropped hero object** — applied to the date block `19 SET`,
which is set large enough to be clipped by the hero's right edge on mobile (§ 2.2, § 5.2).
Corner-anchored composition on desktop. Confidence in long Portuguese words at display size.

**What we reject.** A product-photography-led hero (we have no product, and the cut-out of the two
people may not exist at usable resolution — see § 8.1). The far-separated CTA: on a mobile
registration page the CTA must be in the thumb zone, not diagonally opposite the copy.

---

## 2. Synthesis

### 2.1 Why these references were chosen

Nine files, four backgrounds (white, off-white, taupe, near-black), and one thing in common:
**every single one presents a single subject with a great deal of empty space around it, and
rations colour and ornament severely.** None uses a card grid. None uses glassmorphism. None has a
badge cluster, a testimonial, a statistics row or a feature-icon section. Six of the nine are dark
or near-black. Seven of the nine build depth from a *photographic or rendered object with a real
shadow*, not from stacked translucent panels.

The attraction is not to any style. It is to **object-and-space composition with rationed colour**.

### 2.2 The seven principles carried forward

| # | Principle | Source | Application here |
| --- | --- | --- | --- |
| 1 | One subject per view, with room around it | iMac, Linkkit, Watch Ultra | The hero has one subject: the title lockup. The form section has one subject: the form. |
| 2 | Depth from one light source and occlusion — never from layered glass | MacBook Pro, Otherlife, Linkkit | One radial glow; the chart passes behind the type; the poster casts a real ground shadow. Zero `backdrop-filter`. |
| 3 | Rationed colour: one action colour, everything else structural | iMac, Lemon Squeezy, Otherlife | Gold is the action colour and appears nowhere else. Blue is structural. |
| 4 | Flat colour fields, not gradients | Lemon Squeezy | Flat navy and flat blue. The only gradient permitted is the single hero glow. |
| 5 | Ornament must carry meaning | Roasti | The chart motif is the event's subject. It is the only decorative element on the page. |
| 6 | Wide-tracked caps micro-labels instead of badges | Lemon Squeezy, Watch Ultra | `Realização`, `Apoio`, `Detalhes`, field group labels. Also what the banner itself does. |
| 7 | Oversize and crop the anchor element past the frame | Watch Ultra, Lemon Squeezy | `19 SET` is clipped by the hero edge. |

### 2.3 What is deliberately *not* taken from any reference

Recorded explicitly so a future session does not "restore" them:

- **No 3D / WebGL / Three.js** (Spline, Otherlife). Nothing on the page needs it, it would dominate
  the mobile performance budget, and core information must never depend on it.
- **No neon-glow type** (MacBook Pro). Destroys contrast on navy; the glow goes behind the type.
- **No animated particles or embers** (Roasti). Decorative motion with no purpose.
- **No perspective-transformed device mockups** (Lemon Squeezy, Linkkit, Tonemaki). There is no app.
- **No client/social-proof logo row framed as endorsement** (Lemon Squeezy, Tonemaki). Our logo row
  is `Realização` / `Apoio` — a factual credit, using the banner's own labels.
- **No manufactured statistics** (Roasti's `10+ years`, Lemon Squeezy's `thousands of companies`).
- **No centred hero** (iMac, Linkkit, Spline). Rejected for a three-line lockup in Portuguese.
- **No reference palette**: not violet, not coral, not taupe, not orange, not mint.
- **No top navigation bar** (all Apple references, Spline, Lemon Squeezy). One-action page.

---

## 3. Colour

### 3.1 Derivation

The banner is a navy field carrying a blue chart, with white type, one light-blue display colour and
one yellow accent. The digital translation preserves those **roles** rather than copying the values
verbatim: the page background is pushed slightly deeper than the banner's `#0C1334` to buy contrast
headroom for accessible text and to sit better on OLED phones.

### 3.2 Tokens

Values are measured from the banner unless marked *derived*. Names are conceptual; the Tailwind v4
`@theme` mapping is an implementation detail.

**Surfaces**

| Token | Hex | Origin | Use |
| --- | --- | --- | --- |
| `ink-900` | `#070B1E` | *derived* (banner navy, deepened) | Page background |
| `ink-800` | `#0C1334` | banner deepest navy | Section surfaces, footer |
| `ink-700` | `#101A44` | *derived* | Form field surface, raised panels |
| `ink-600` | `#16255E` | *derived* | Hairline dividers (decorative only — see § 3.6) |
| `blue-600` | `#0D2369` | banner mid navy | Chart motif fill, deep accents |
| `blue-500` | `#1656C4` | banner brand blue | The `para jovens` pill, the logo-bar panel, section accents |
| `blue-400` | `#2A6FE0` | *derived* | Hover state of blue surfaces |

**Content**

| Token | Hex | Origin | Use | Contrast on `ink-900` |
| --- | --- | --- | --- | --- |
| `text-primary` | `#FFFFFF` | banner | Headlines, form labels, values | **19.52:1** |
| `text-secondary` | `#D4E7EF` | banner pale blue-white | Body copy, meta lines | **15.32:1** |
| `text-muted` | `#9FB3D9` | *derived* | Hints, timestamps, footer | **9.23:1** |
| `sky-300` | `#71C1FC` | banner `PALESTRA` blue | Display accent word, focus ring, chart stroke | **9.98:1** |
| `gold-400` | `#FFC400` | banner yellow accent | **The action colour.** CTA fill, price emphasis | **12.22:1** |
| `border-strong` | `#5A6FA8` | *derived* | Form field borders, interactive boundaries | **3.97:1** |
| `danger-300` | `#FF8A80` | *derived* | Error text and error borders | **8.55:1** |
| `success-300` | `#6EE7A8` | *derived* | Confirmation accent (admin status only) | **12.70:1** |

All measured with the WCAG 2.x relative-luminance formula.

### 3.3 Text tier rule

Three tiers, never more: white for what must be read first, `#D4E7EF` for what is read next,
`#9FB3D9` for what is read only if needed. **Do not introduce a fourth grey**, and never place body
copy at reduced `opacity` — that is how a page ends up failing contrast without anyone noticing.

### 3.4 The action colour — decision

**The primary CTA is `gold-400` fill with `ink-900` text (12.22:1).**

Reasoning, in order:

1. The banner already uses yellow for its single most important message — `INSCRIÇÕES GRATUITAS`.
   Using it for the action that *is* the free registration is the event's own logic, not an
   imported convention.
2. A blue button on a navy page is mush: `blue-500` on `ink-900` is only 2.94:1, below the 3:1
   needed even for a non-text boundary.
3. Rationing (§ 2.2 principle 3) requires the action colour to appear nowhere else. Blue appears
   everywhere structurally, so blue cannot be the action colour.

Gold appears in exactly three places: the primary CTA, the word `gratuita` in the details list, and
the submit button. Nowhere else. If gold shows up in a fourth place, the design is drifting.

**One amendment, Phase 5.2 (§ 7.4).** The counting rail carries **two** gold beads, one bead wide,
and they are the fourth place. They are admitted because they do the rationing's job rather than
breaking it: they are the eye's finishing point on an object made of one blue, and there are two of
them on a page that has no other warm mark above the fold. Two conditions bound them — they are
deepened (`gold-400` mixed 86% with `blue-600`) so they cannot compete with the one gold *button* in
the same view, and the count is two. A third gold bead is drift.

### 3.5 Button hierarchy

| Level | Appearance | Used for |
| --- | --- | --- |
| Primary | `gold-400` fill, `ink-900` text, pill, weight 700 | `Garantir minha vaga`, `Confirmar inscrição` — one per view |
| Secondary | Transparent fill, 1px `border-strong`, `text-primary` label, pill | `Como chegar`, `Adicionar ao calendário`, `Compartilhar` |
| Tertiary | Text with a 1px underline offset, `sky-300` | Inline links, `Como usamos seus dados` |

Never two primary buttons in one view.

### 3.6 Non-text contrast

WCAG 2.2 SC 1.4.11 needs 3:1 for boundaries that identify a control. Consequences:

- Form field borders use `border-strong` (3.97:1 on `ink-900`, 3.41:1 on the `ink-700` field
  surface) — **not** `ink-600`, which is 1.36:1 and would fail.
- `ink-600` is permitted only for **decorative** dividers that carry no information.
- The field's own surface (`ink-700` on `ink-900`, 1.17:1) is intentionally low contrast. The
  boundary is the border, not the fill. Do not "fix" this by lightening the fill.

### 3.7 Colour scheme

The public page is **dark only**, with `color-scheme: dark` declared so native controls, scrollbars
and autofill render correctly. It is a single-purpose page with a fixed identity; a light variant
would be a second design with no audience.

The admin is **light only**. See § 12.

---

## 4. Space, rhythm and composition

### 4.1 Spacing scale

A single 4 px-based scale. Only these steps exist:
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`.

Anything not on the scale is a mistake, with one exception: optical adjustments to display type
(negative tracking, line-height under 1) which are typographic, not spatial.

### 4.2 Section rhythm

| | Mobile | Desktop |
| --- | --- | --- |
| Section vertical padding | 64 px | 128 px |
| Gap between a heading and its content | 24 px | 32 px |
| Gap between sibling blocks inside a section | 32 px | 48 px |
| Page horizontal gutter | 20 px | `max(24px, (100vw − 1200px) / 2)` |
| Content max width | — | 1200 px |
| Prose max width | 62ch | 62ch |

Sections do not all share the same padding: the hero is deliberately taller and the logo bar
deliberately tighter. Uniform section padding is what makes a page read as a template.

### 4.3 Whitespace as a rule, not a leftover

The empty area in the hero is a **specified element**. On desktop, at least 30% of the hero's area
must remain empty of type or imagery. If new content needs to go somewhere, it goes in a new
section, not into the hero's air.

---

## 5. Composition and layout

### 5.1 Hero

**Mobile (≤ 767 px)** — one column, `min-height: 88svh` (`svh`, not `vh`, so the mobile browser
chrome does not cause a jump).

```
┌──────────────────────────────┐
│ [skip link, on focus]        │
│                              │  ← 48px
│ PALESTRA                     │  ← kicker, tracked caps, sky-300
│ educação                     │  ← display-2, weight 300
│ Financeira                   │  ← display-1, weight 800, clipped optically
│ ( para jovens )              │  ← pill, blue-500 fill
│                              │  ← 32px
│      19 SET ─────────────────┼─▶ cropped by the right edge
│ 19h às 21h · Espaço Cezanne  │  ← meta, text-secondary
│                              │  ← 32px
│ ┌──────────────────────────┐ │
│ │  Garantir minha vaga     │ │  ← primary CTA, full width, 56px tall
│ └──────────────────────────┘ │
│ Inscrição gratuita ·         │  ← commercial line, small, text-muted
│ Coffee break incluso         │
│                              │  ← 48px
│ ─ chart motif behind all ────┼─▶ bleeds off both edges
└──────────────────────────────┘
```

**Desktop (≥ 1024 px)** — asymmetric 12-column split, following § 1.3:

- Columns 1–7: the type stack, left-aligned, vertically centred.
- Columns 8–12: the date block `19 SET` set very large and rotated 0°, plus the chart motif at its
  brightest, cropped by the right viewport edge.
- Full-width strip along the hero's bottom edge: the `Realização` / `Apoio` logo row, at low
  emphasis. This mirrors both the banner's own structure and the pattern confirmed by Tonemaki and
  Lemon Squeezy.
- The primary CTA sits in columns 1–4, overlapping the chart glow (§ 1.8).

**768–1023 px** — one column, but the date block moves beside the meta line rather than above it,
and the logo row becomes a single centred row. This is a *third* composition, not a stretched
mobile one.

### 5.2 The date block as the second subject

`19 SET` is the composition's anchor, exactly as in the banner. Treatment:

- `19` at width 75 (condensed), weight 700, `font-variant-numeric: tabular-nums`.
- `SET` at width 115 (expanded), weight 400, in `sky-300`.
- Baselines aligned; the two set as one lockup with no space between them, reproducing the banner's
  `19SET` join.
- Sized so it is optically clipped by the container's right edge on mobile (§ 1.9).
- Marked `aria-hidden="true"`; the accessible date is the full text in the meta line and the `<dl>`.
  A screen reader must never hear "19 SET" as a fragment.

### 5.3 Section-by-section notes

| Section | Composition |
| --- | --- |
| **O convite** | Two blocks: 62ch of editorial copy, and the original banner rendered as a poster (§ 8.2). Desktop: side by side, copy left, poster right, poster slightly larger than its column so it overlaps the gutter. |
| **Detalhes** | A `<dl>` in two columns on desktop, one on mobile. Terms in wide-tracked caps `text-muted`; values in `text-primary`. `Gratuita` is the one gold word. A `Como chegar` secondary button. No icons except the map pin, reproduced from the banner. |
| **Inscrição** | Desktop: two columns — left holds a short reassurance block and the venue recap; right holds the form on an `ink-800` panel. Mobile: the form panel full-width, with the recap above it. Placing the recap beside the form means a desktop user never has to scroll back to check the date. |
| **Realização e apoio** | A single `blue-500` panel with `r-panel` radius, holding the four marks reversed in white — a direct, deliberate reproduction of the banner's own footer bar. Two labelled groups separated by a vertical rule, as on the banner. |
| **Rodapé** | One line: organizer names, privacy link, nothing else. No newsletter, no social icons unless the organizers supply real accounts. |

---

## 6. Typography

### 6.1 Family — decision

**One variable family: `Archivo`.** Verified available from Google Fonts (v25) as a variable font with
axes `wght 100–900` and `wdth 62–125`.

Why this family and not another:

- The banner's identity depends on **width contrast** — a wide heavy display against condensed
  numerals (§ 1 of [EVENT-SOURCE-OF-TRUTH.md § 8](./EVENT-SOURCE-OF-TRUTH.md)). A `wdth` axis
  reproduces that from **one file**. Achieving it with static fonts needs two or three families.
- Archivo is a grotesque with real character in its heavy weights, without the neutrality that makes
  Inter read as a default, and without the quirk that would make a display face wrong for form
  labels.
- Full Latin coverage for `ã õ ç á â à é ê í ó ô ú`.

Loaded via `next/font/google`, which self-hosts the file — no request to `fonts.gstatic.com`, no
render-blocking third party, and a simpler CSP. `display: swap`, `subsets: ['latin']`, preload the
one file used above the fold.

**Fallback stack:** `Archivo, "Archivo Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
`next/font` generates the metric-matched `Archivo Fallback` automatically, which is what keeps CLS at
zero during the swap.

**If Archivo proves unsuitable at implementation time**, the substitute is `Inter Variable` for text
plus `Archivo Narrow`/`Roboto Condensed` for the date lockup — two files instead of one. Do not
substitute a display-only face for body text.

### 6.2 Scale

Fluid via `clamp()`. Mobile values are the floor.

| Role | Size | Weight | Width | Tracking | Line-height |
| --- | --- | --- | --- | --- | --- |
| `display-1` (`Financeira`) | `clamp(3rem, 13vw, 7.5rem)` | 800 | 110 | −0.03em | 0.92 |
| `display-2` (`educação`) | `clamp(1.75rem, 7vw, 3.5rem)` | 300 | 100 | −0.01em | 1.0 |
| `date-numeral` (`19`) | `clamp(3.5rem, 15vw, 6.5rem)` | 700 | 75 | −0.02em | 0.85 |
| `date-month` (`SET`) | `clamp(3.5rem, 15vw, 6.5rem)` | 400 | 115 | 0.02em | 0.85 |
| `kicker` (`PALESTRA`) | `0.8125rem` | 700 | 100 | 0.18em | 1.2 |
| `h2` | `clamp(1.5rem, 5vw, 2.5rem)` | 700 | 105 | −0.02em | 1.1 |
| `h3` | `1.125rem` | 700 | 100 | −0.01em | 1.3 |
| `body` | `clamp(1rem, 1.5vw, 1.125rem)` | 400 | 100 | 0 | 1.6 |
| `label` | `0.9375rem` | 600 | 100 | 0 | 1.4 |
| `micro-label` | `0.75rem` | 700 | 100 | 0.12em | 1.2 |
| `input` | **`1rem` minimum** | 400 | 100 | 0 | 1.5 |
| `hint` / `caption` | `0.875rem` | 400 | 100 | 0 | 1.45 |

`input` at 1rem (16px) is a hard floor: below it, iOS Safari zooms on focus.

### 6.3 The title lockup

The single most important typographic decision. It reproduces the banner's hierarchy in semantic HTML:

```
<h1>
  <span class="kicker">Palestra</span>
  <span class="display-2">educação</span>
  <span class="display-1">Financeira</span>
  <span class="pill">para jovens</span>
</h1>
```

- One `<h1>`. Its accessible name reads "Palestra educação Financeira para jovens", which is the
  event's name.
- The weight jump from 300 to 800 between lines 2 and 3 *is* the identity. Do not soften it.
- `educação` sits on `Financeira` with negative margin so the ascenders nearly touch, as on the
  banner.
- `para jovens` sits inside a `blue-500` pill at `0.14em` tracking — the banner's most distinctive
  detail, reproduced faithfully.
- On mobile, `Financeira` may be optically clipped by 1–2% at the right edge. That is intentional
  (§ 1.9) and must not trigger horizontal page scroll — clip with `overflow: clip` on the container,
  never leave the document wider than the viewport.

### 6.4 Portuguese-specific rules

- Long words (`Financeira`, `Educação`, `Inscrições`, `Hortolândia`) must never hyphenate at display
  size: `hyphens: none` on display roles.
- Enable `hyphens: auto` with `lang="pt-BR"` on body prose only.
- Control wrapping with `max-width` in `ch`, and `text-wrap: balance` on headings, `text-wrap: pretty`
  on paragraphs — both are widely supported and cost nothing.
- Never rely on `text-transform: uppercase` for meaning: `PALESTRA` is styled uppercase from the
  source text `Palestra`, so screen readers do not spell it out letter by letter.

---

## 7. Background and depth

Total decorative budget for the entire page: **one SVG chart, one radial glow, one grain overlay,
the Financial Journey Line (§ 10.8), and the counting rail (§ 7.4).** Nothing else. No blobs, no mesh
gradients, no floating cards, no glassmorphism, no particles.

The last two items are amendments — Phase 5.1 and Phase 5.2 — and both are admitted on the same
terms as the first: each is the subject of the talk rather than an ornament borrowed from elsewhere,
each is *one* idea rather than several, and each was added once, deliberately, for a named reason.
The budget has grown twice in the life of this page and both entries are specified in full. A sixth
element is drift, and the answer to it is this sentence.

### 7.1 The chart motif

The banner's financial line chart is the only decorative element, and it qualifies under the meaning
test (§ 1.7): it *is* the subject of the talk.

- A single inline `<svg>` — one `<path>` for the line, 8–12 `<rect>`s for the volume bars beneath.
- Stroke `sky-300` at 6% opacity; bars `blue-500` at 4%.
- Positioned in the hero, bleeding off both horizontal edges.
- **Amended in Phase 5.2.** Below 1024px it is unchanged. From 1024px its mask centre moves to the
  left of the frame, under the type stack and the CTA, because the counting rail (§ 7.4) now holds
  the right half and two chart-like things in one corner is mush. The glow does not move: the object
  and the date are still lit by the page's single light source (§ 1.2). What moved is texture, not
  light, and the motif still bleeds off the left edge.
- Inline (not a file) so it costs no request and can be themed by CSS custom properties.
- `aria-hidden="true"`, `focusable="false"`.
- Size budget: ≤ 2 KB of markup.

### 7.2 Three depth planes via occlusion

Following § 1.6, extracted from 3D into plain CSS stacking:

| Plane | Contents |
| --- | --- |
| **Back** | Chart motif, radial glow, grain |
| **Middle** | The title lockup, the date block, the meta line |
| **Front** | The `para jovens` pill and the primary CTA, both overlapping the chart's brightest region |

The front plane visually **occludes** the back plane. That single relationship produces more
convincing depth than any blur or translucency, at zero rendering cost, and it is the reason this
page does not need WebGL.

### 7.3 Glow and grain

- **Glow:** one `radial-gradient` in `sky-300` at ~8% peak opacity, ~70vw wide, centred behind the
  title lockup. Static. Never animated.
- **Grain:** a tiled SVG `feTurbulence` pattern as a `data:` URI background at 3% opacity, applied
  once to the page. It reproduces the banner's film grain, eliminates gradient banding on large
  navy areas, and is the cheapest single thing that makes a dark page read as art-directed rather
  than flat. Budget ≤ 1.5 KB. Requires `img-src 'self' data:` in the CSP
  ([ARCHITECTURE.md § 9](./ARCHITECTURE.md)).

Both are `pointer-events: none` and `aria-hidden`.

### 7.4 The counting rail — Phase 5.2

**Approved amendment.** The hero's right half held one object — the `19SET` lockup, low and cropped —
and a great deal of air above it that nothing explained. § 5.1 asks that half to be the composition's
second subject; what was there was the second subject's *caption*. This section adds the object.

**The idea, in one sentence.** An abacus, reduced to what a contemporary designer would keep of it: a
partial frame, five rails, twenty-two beads and two gold ones, drawn in the page's own palette,
cropped by the right edge of the frame like everything else on that side of the hero.

It qualifies on § 1.7's meaning test for the same reason the chart motif does — counting, ordering
and putting values where they belong *is* the subject of the talk — and it takes its art direction
from `references/visual/hero/abacus-reference.jpg`: a dark navy object, blue beads, a very few brass
ones. What it does not take is the render. There is no photograph, no 3D framework, no material, no
floor shadow. It is 5 KB of inline SVG.

#### What keeps it from reading as a toy

| Decision | Why |
| --- | --- |
| A **partial frame** — a crown and a left stile that dissolve to the right, no bottom member at all | A closed tray is a school abacus. An open bracket is an object. |
| **Uneven groups, mostly left** — a rail carrying one bead, clusters resting on the stile, gaps wide enough for a movement to be legible | The asymmetry of the reference. A grid of evenly spaced dots is a texture, not a count. |
| **One blue, mixed toward the page's own ground** (`blue-500` at 74% with `ink-900`), with a matte top-to-bottom shade and no specular highlight | The flat token is the pill's colour and reads as plastic at bead size. |
| **An empty base rail** | The lockup's cap height reaches into that row at every width; a bead half-behind a glyph reads as a mistake. Emptied, the rail does three other jobs — the stile stands on it, it rhymes with the line one gap below it, and the date drops into the quiet it leaves. |
| **Two gold beads** (§ 3.4) | The eye needs somewhere to finish. Two, deepened, never three. |

#### Where it sits, and why that is arithmetic rather than taste

The object's **lowest rail sits exactly one rail gap above the Financial Journey Line's run through
the hero** — the altitude the `19SET` lockup stands on. So the line reads as the rail this
composition is missing, and the date as the value counted onto it. Nothing is drawn twice and nothing
is superimposed: the relationship is rhythm.

That position is computed in the stylesheet from the tokens the lockup is sized from, never
eyeballed:

```
bottom: calc(19% + 0.1615 * var(--date-size) + 0.1 * var(--rail-w))
         │           │                          └ one rail gap: 90 of the drawing's 900 units
         │           └ 19% of the lockup's own 0.85em box — where its baseline is
         └ the lockup wrapper's own offset from the hero's foot
```

`--date-size` was hoisted out of `.u-date-lockup` for this: two elements now depend on it, and a
number typed twice is a rail that drifts the first time the lockup is resized.

`--rail-w` is `min(42vw, 700px)` and that ceiling is measured, not chosen. The object is 0.6 of its
own width tall once the gap beneath it is counted; at 1024px — where `Financeira` is capped at 7.5rem
and therefore takes a *larger* share of the frame than at 1440px — anything wider drives the crown up
into the display line. Anything much narrower does the opposite damage: the object stops being wider
than the lockup beneath it and the beads nearest the date end up behind it. Both failures are pinned
by tests in `e2e/public-design.spec.ts`.

**Depth is the § 7.2 model doing a third job.** The object is in the hero's back plane, the journey
line paints in front of it, and the lockup stands in front of both. Three planes from two occlusions,
no translucency, no blur.

#### Motion

Three behaviours, and each is bounded by what it is allowed to cost.

**Entrance** — pure CSS, no observer, no island, because the object is above the fold by definition.
The frame settles, the five rails extend out of the stile, the bead groups arrive from the right —
always from the right, because a bead travelling left is being counted and one travelling right is
being cleared — and the second gold bead is the last beat, landing beside the date at about 1.9s.
`transform` and `opacity` only; the delays are set so that no more than seven elements are ever in
flight at once, which is § 10.4's cap.

**Pointer** — a bounded amendment to § 10.4's ban on parallax, and the ban's own reason is what
bounds it. The object takes a few degrees of perspective from the pointer's position in the viewport,
pivoted on its bottom-left corner — the one point that must not move, because it is where the object's
rhythm meets the line's — and the nearer bead groups drift a few units *along their rails*, which is
the one direction a bead can actually travel. Both are damped by a 520ms transition, so the object
arrives where the pointer went a moment ago rather than tracking it. It attaches only on a fine
pointer, only at 1024px and above, and never under reduced motion: a tilt that fires on tap and then
sticks is exactly the gimmick the prohibition exists to prevent. The island is `RailPointer`: one
passive listener, one rAF, two custom properties, about forty lines.

**Scroll** — two movements, once each, and **no second scroll listener anywhere on the page**. A new
journey primitive, `JourneyCue`, marks a height; the controller that already measures the page reports
having passed it with the same `data-reached` flag it writes on the five visible nodes, and a
stylesheet rule slides one bead group left. Both cues sit well below the object — the first under the
hero's foot, the second inside the next section — so neither can fire on the frame the page arrives.
Reversible, like the line itself: scroll back and the beads return, because the whole system reads the
reader's position rather than remembering it.

#### The scrub, and the fusion — Phase 5.3

Two additions, and they are why the object stopped being an illustration.

**The beads follow the scroll.** The hero's scroll position, normalised across the object's own
height, drives a horizontal offset per bead group — continuously and reversibly, not as two triggered
snaps. The amplitudes are a hierarchy rather than a setting: two or three groups answer clearly, one
of them travelling *right* while the others travel left, and the rest barely move. The gold beads are
the quietest of all, because an emphasis that fidgets stops being an emphasis. A convergence tail
(§ 10.1, rule 3) gives the movement mass without unhooking it from the reader's thumb.

**The line merges with one rail.** The Journey Line descends the gap between the type and the object,
becomes collinear with the rail carrying the second gold bead for a short run — the line passes
*behind* the object, so along that run the rail itself simply reads brighter and heavier — and then
peels off and lands on the date. Short on purpose: a moment of coincidence, not the line becoming the
rail. The entry and exit points are positioned as percentages of the object's own box rather than
from a formula over type tokens, so the fusion survives a change of typography, and a test measures
it at 1024, 1280, 1440 and 1920.

#### Reduced motion

A different program, not a faster one, exactly as § 10.8 requires of the line. The entrance does not
run, the perspective is the static one the object was drawn at, the pointer island never attaches,
the scrub never runs, and the two bead accents are **already made** — the controller reports every cue
reached in this mode, so what renders is the composition after both counts rather than a version that
never moved.

#### Where it does not go

**Below 1024px there is no counting rail, and that is a decision rather than an omission.** The phone
and tablet heroes are a single column of display type with the lockup cropped by the edge; there is no
right-hand region to put an object in. Every version that fits — a sliver in the corner, a band under
the CTA, a shrunken copy — is either unreadable as an abacus or competing with the primary action at
the width where the primary action matters most. The brief's own constraint settles it: nothing may
make the hero harder to read on a phone. So the mobile hero is unchanged, and the object costs a phone
exactly nothing: no markup, no bytes, no listener.

#### The test it has to pass

Take the object out and the hero is what it was: correct, and short of a second subject. Take the
*motion* out and the object still reads — which is why the entrance is choreography rather than
construction, and why the authored bead positions are a finished composition on their own.

---

## 8. Imagery

### 8.1 The photograph — decision

The banner is a flattened composite. Cutting the two people out of a 1080 × 1440 PNG yields roughly
490 × 720 px of usable subject — too small for a desktop hero at 2× DPR, and a soft or haloed cut-out
would undo everything else in this document.

**Specified default: build the hero typographically, with no photograph.** This follows the
MacBook Pro, Lemon Squeezy and Linkkit references, all of which carry a hero on type and atmosphere
alone. The page loses nothing: the hero's job is the title, the date and the CTA.

**Enhancement path:** if the organizers supply a high-resolution transparent cut-out (≥ 1600 px tall)
and confirm image rights ([EVENT-SOURCE-OF-TRUTH.md § 10](./EVENT-SOURCE-OF-TRUTH.md)), promote it
into the desktop hero's columns 8–12, bleeding off the bottom-right corner exactly as on the banner,
behind the front plane. This is an additive change to one section.

### 8.2 The poster moment

The banner itself becomes a designed element in **O convite**, presented the way the references
present a product:

- Rendered at its native 3:4 ratio inside `r-panel` rounded corners.
- A single large, soft, low-opacity ground shadow — Linkkit's entire depth model (§ 1.5).
- A ≤ 2° rotation and a ≤ 1% scale on hover (desktop only, pointer-fine only). No 3D transform, no
  perspective, no tilt-follow-cursor.
- `next/image` with an explicit `sizes`, AVIF then WebP, `loading="lazy"`, `fetchPriority="low"`.
- Real `alt` text carrying the factual content: `Cartaz do evento: Palestra Educação Financeira para
  Jovens, 19 de setembro, 19h às 21h, Espaço Cezanne Eventos, Hortolândia/SP. Inscrições gratuitas,
  coffee break incluso.` The poster contains information; its alt text must too.

The poster is never the LCP element — the title lockup is, and it is text.

### 8.3 Logos

- Reversed white (with the banner's yellow retained where it is part of the mark) on the
  `blue-500` panel.
- SVG if supplied; otherwise 3× WebP crops (visibly softer — flagged in § 10 of
  EVENT-SOURCE-OF-TRUTH).
- Optically normalised heights, not mathematically equal ones: a wide wordmark and a tall tower mark
  set to the same pixel height look wrong.
- Each is an `<img>` with `alt` set to the organization's name. If a mark is purely decorative
  alongside adjacent text, `alt=""` and let the text carry it — never both.
- No grayscale-to-colour-on-hover trick. These are credits, not an interactive gallery.

### 8.4 Icons

Roughly six icons are needed. **Inline local SVG, no icon library.** A `components/icons.tsx` with
six 24 × 24 paths costs about 1 KB; `lucide-react` costs a dependency and a bundle-splitting problem
for the same result. Every icon is `aria-hidden` and accompanied by text — no icon is ever the only
label for a control.

---

## 9. Form presentation

The form is the product. It gets the most careful treatment on the page.

### 9.1 Container

- An `ink-800` panel, `r-panel` (20 px) radius, 1 px `ink-600` hairline border, 24 px padding on
  mobile / 32 px on desktop.
- A `<fieldset>` with a visually-hidden `<legend>` (`Dados da inscrição`) so the group is announced.
- No shadow on the panel. Elevation on a dark page comes from surface lightness, not from shadows
  that are invisible against navy anyway.

### 9.2 Field anatomy

```
Nome completo                    ← label, 0.9375rem/600, text-primary, 8px below
┌──────────────────────────────┐
│                              │ ← 52px tall, ink-700 fill, 1px border-strong,
└──────────────────────────────┘   r-field (12px), 16px horizontal padding, 1rem text
Com DDD. Ex.: (19) 99999-9999    ← hint, 0.875rem, text-muted, 6px below
```

- **Label above the input, always.** No floating labels: they animate on focus (a motion cost), they
  collide with autofill, and they leave a field ambiguous once filled.
- Fields stacked vertically at 20 px gaps, full width, even on desktop. A three-field form does not
  benefit from a grid.
- Vertical stack order: Nome → Idade → Celular. Easiest first.

### 9.3 States

| State | Treatment |
| --- | --- |
| Default | `ink-700` fill, 1px `border-strong` |
| Hover (pointer only) | Border lightens to `#6B80B8` |
| **Focus** | 2px `sky-300` outline at 2px offset, border becomes `sky-300`. Never removed, never replaced by a colour change alone. |
| Filled | Unchanged from default. A filled field is not a state that needs signalling. |
| Invalid | Border `danger-300`, `aria-invalid="true"`, message below in `danger-300` preceded by a 16 px alert icon. Colour is never the only signal. |
| Disabled | Not used. Fields are never disabled in this form. |
| Autofilled | Explicitly styled (`:autofill`) to keep the dark surface — browsers otherwise force a pale yellow fill that breaks contrast. |

### 9.4 Error summary

On a failed submit, an error summary appears directly above the fieldset:

- `role="alert"`, `tabindex="-1"`, and **receives focus**.
- A heading (`Verifique estes campos`) plus an `<ul>` of links, each jumping to and focusing its field.
- `danger-300` 1px border on an `ink-800` fill. No red flood fill.
- It appears above the form, not below the button, so a mobile keyboard cannot hide it.

This is the established accessible-forms pattern and it is required, not optional.

### 9.5 Submit button

- Full width on mobile, `min-height: 56px`. Auto width on desktop, `min-height: 52px`.
- `gold-400` fill, `ink-900` label at weight 700.
- Focus ring on gold uses `ink-900` (12.22:1) instead of `sky-300`, which would be too close in
  luminance to the gold to be visible.
- Pending: label `Confirmando…`, a spinner, `aria-busy="true"`, `aria-disabled="true"`. **Not**
  `disabled` — a disabled button leaves the tab order and drops its accessible name mid-interaction.
- Beneath: the privacy line, and beneath that the Turnstile widget (or its reserved space).

### 9.6 Reserving space for the widget

The Turnstile widget must occupy **reserved height from first paint** (a fixed-height wrapper). A
widget that appears after hydration and pushes the submit button down is a direct CLS regression on
the most important element of the page.

### 9.7 Outcome panel

On completion the fieldset is replaced in place by the outcome panel — same panel, same width, so
the page does not jump.

- Panel gains a 1px accent border: `success-300` for confirmed, `sky-300` for waitlisted,
  `border-strong` for the neutral outcomes.
- `role="status"`, `aria-live="polite"`, `tabindex="-1"`, and receives focus.
- A 200 ms opacity cross-fade, and only that. **Content is present and announced before the fade
  begins.** Nothing about the success state depends on an animation completing.
- Secondary actions as secondary buttons (§ 3.5), never as a second primary.

### 9.8 Mobile keyboard and viewport

- All layout heights use `svh` / `dvh`, never `vh`.
- `scroll-padding-bottom` on the scroll container equals the sticky CTA bar's height, so a focused
  field is never hidden behind it (WCAG 2.2 SC 2.4.11).
- The sticky CTA bar hides itself when the form section is in view, so it can never cover a field.
- `env(safe-area-inset-bottom)` respected on the sticky bar for notched devices.
- After a validation failure, scroll the error summary into view with `block: 'center'` so it is not
  behind the keyboard.

---

## 10. Motion system

### 10.1 Philosophy — revised in Phase 5.3

**Calm at rest, kinetic under the hand.** The page still settles once on arrival and still never
gates content. What Phase 5.3 changes is what is allowed *after* that: scroll and pointer may drive
motion expressively, because motion that answers an action reads as an instrument responding, while
motion that runs on its own reads as decoration.

Five rules, and they are the whole system:

1. **Causal.** Every movement past the entrance is the consequence of something the visitor did — a
   scroll position, a pointer position. Nothing moves because time passed.
2. **Reversible where reversal means something.** Scroll back up and the line retracts, the beads
   return, the nodes unlight. The page reads the reader's position; it does not keep a score.
3. **Convergence tails are permitted.** After a real input, a value may interpolate toward its target
   across a few frames and then stop — with an explicit epsilon *and* an explicit time ceiling, and
   the frame loop cancelling itself the moment it converges. This is what buys mass and inertia
   without buying a loop.
4. **No infinite decorative animation.** Unchanged and absolute: nothing idles, pulses, shimmers or
   breathes while the page is untouched. A loop with no input behind it is decoration.
5. **Reduced motion is a complete static state**, never a faster one; and performance stays a
   requirement rather than a budget to spend — no measurement during scroll, no per-frame work at
   rest, `transform` and `opacity` only.

### 10.2 Primitives

Exactly three. Everything on the page is one of these.

| Primitive | Properties | Duration | Easing |
| --- | --- | --- | --- |
| `rise` | `opacity 0→1`, `translateY 12px→0` | 380 ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `settle` | `opacity`, `background-color`, `border-color` | 150 ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `press` | `transform: scale(1 → 0.98)` | 120 ms | `cubic-bezier(0.4, 0, 0.2, 1)` |

Only `opacity` and `transform` are ever animated. No `filter`, no `box-shadow`, no `backdrop-filter`,
no `width`/`height`, no `top`/`left`.

### 10.3 Application

| Moment | Behaviour |
| --- | --- |
| Hero entrance | `rise` on the kicker, display-2, display-1, pill, date, meta and CTA, staggered 60 ms, total under 700 ms. Once, on load. Pure CSS `animation-delay` — no JavaScript. |
| Chart motif | One `stroke-dashoffset` draw over 1200 ms, `ease-out`, 200 ms delay. Once. Decorative. |
| Counting rail | Frame, rails, then bead groups, staggered; ends at ~1.9 s. `transform`/`opacity` only, ≤ 7 elements in flight. Once, on load, from 1024 px (§ 7.4). |
| Section reveal | `rise` on first intersection, 300 ms, `threshold: 0.15`, `once: true`. One shared `IntersectionObserver`. |
| Button hover | `settle` on background |
| Button / row tap | `press` |
| Field focus | `settle` on border and outline |
| Outcome panel | 200 ms opacity cross-fade (§ 9.7) |
| Sticky CTA bar | `rise` in, reverse out, 250 ms |

### 10.4 Hard prohibitions

- No scroll-jacking, no scroll-snapping, no pinned sections. Scroll may *drive* motion (§ 10.1, rule
  1); it may never take the scroll away from the reader.
- Parallax is pointer-driven only, bounded to a few degrees on a single decorative object,
  desktop-only, and off under reduced motion (§ 7.4).
- Scroll-linked scrubbing is permitted **only where a section of this document bounds it and names
  its costs**: the Financial Journey Line's `stroke-dashoffset` and head (§ 10.8), and the counting
  rail's bead positions (§ 7.4). The prohibition's reason stands — scroll-linked work is an INP and
  jank risk on low-end Android — so every such driver shares one measurement, one `requestAnimation-
  Frame` and one passive listener for the whole page, writes custom properties rather than reading
  layout, and stops the moment it converges.
- No looping animation anywhere: no pulse, no shimmer, no bounce, no marquee. The journey's two rings
  play **once each**, when the line reaches them, and never again.
- No animation on more than ~8 elements simultaneously. The counting rail's entrance is staggered to
  hold that ceiling at seven (§ 7.4).
- No staggered reveal below the fold beyond the first section — a page that keeps animating as you
  scroll feels cheap, not premium.

### 10.5 The subtractive-reveal rule

**Reveal-on-scroll must be additive.** Content is fully visible in the static CSS; the observer adds
the entrance animation only when JavaScript has run. Never `opacity: 0` in a stylesheet waiting for
JavaScript to remove it — a script error, a slow bundle or a blocked domain would leave a blank page.

Concretely: JavaScript adds a `js-reveal` class to the container on mount; the `opacity: 0` initial
state exists only under `.js-reveal`.

### 10.6 Reduced motion

Under `@media (prefers-reduced-motion: reduce)`:

- `rise` and the chart draw do not run. Elements are at their final state immediately; the chart
  renders fully drawn.
- `settle` and `press` are reduced to `opacity`-only at ≤ 80 ms. Focus and hover feedback is
  preserved — removing all feedback harms usability.
- The sticky CTA bar appears and disappears without transition.
- No content is hidden or removed. Reduced motion changes *how* things appear, never *whether*.

### 10.7 No motion library

`motion` (13.2.0) is **not** a dependency. Everything in § 10.2 is CSS keyframes plus roughly twenty
lines of `IntersectionObserver`. Nothing here needs spring physics, gestures, layout animation or
exit animation. See [DECISIONS.md](./DECISIONS.md) for the full trade-off.

---

### 10.8 The Financial Journey Line — Phase 5.1

**Approved amendment.** The page as shipped in Phase 5 was clean, quiet and correct, and had nothing
anyone would describe afterwards. This section adds exactly one thing, and it closes the
composition's real gap: the `19SET` lockup sat in the bottom right of the hero with nothing to
explain why, and the chart motif behind it was texture rather than subject.

**The idea, in one sentence.** One line begins at the event's date, descends past the poster, the
details and the form, and comes to rest on the organizers' panel — so the page reads as a single
trajectory rather than as five stacked sections. *"Aquele site da linha que vai acompanhando a
página."*

#### Narrative

Five moments, five nodes, and nothing between them but the line:

| Node | Where | What it does |
| --- | --- | --- |
| **Origin** | On the `19SET` lockup's own baseline, off the left shoulder of the `19` | The date stands *on* the line. From `lg` a horizontal approach run crosses the empty middle of the hero into it — which is the reason the lockup sits where it sits. |
| **Poster** | The poster's left shoulder | The line marks the object, then passes behind it. |
| **Details** | The shell's left margin | An editorial mark in the margin beside the facts. |
| **Registration** | The form panel's top-left shoulder | The destination. The line points into the panel, crosses behind it, and leaves. |
| **Resolution** | Just above the credits panel | The line flattens into a short horizontal run and stops. |

#### Architecture

- **The shape is declared in CSS, not in path data.** A handful of zero-size points
  (`JourneyAnchor`, `JourneyNode`) are positioned against the objects they belong to; the controller
  reads where they actually landed and builds one polyline through them. Responsive behaviour
  therefore lives where the rest of the layout lives, and a breakpoint can be recomposed without
  touching a path command. Two compositions exist — a gutter rail below `lg`, the asymmetric
  traversal at `lg` and above — and each excludes the other's points with `display: none`.
- **The polyline is monotonic in `y`.** Intermediate vertices are swung horizontally only. That one
  property is what lets a scroll position map onto path length at all, and it is why the line can
  never double back across content it has already passed.
- **Per-section canvases, one polyline.** The polyline is sliced across a `JourneySegment` in each
  section, cut exactly at the boundaries so the slices meet. Each sits at `z-index: -1` inside a
  section that isolates itself, which puts the line above that section's background fill and below
  every piece of its content — so the poster, the form panel and the credits panel occlude it with
  no explicit z-index anywhere (§ 7.2). Only the segment currently being drawn repaints.
- **Decorative throughout:** `aria-hidden`, `focusable="false"`, and `pointer-events: none` on the
  canvases *and* on the points. It carries no data, no axis and no number.

#### The scroll driver, and its costs

The exception to § 10.4 is bounded by how the work is split:

- Geometry — every `getBoundingClientRect` — runs on mount, on resize, and when the document's own
  height changes (one `ResizeObserver` on `<body>`, which catches the lazily loaded poster and an
  expanded error summary). **Never during a scroll.**
- Painting runs in one `requestAnimationFrame`, scheduled only when something changed. It reads two
  numbers off `window` and writes one custom property per segment, skipping the write when the value
  is unchanged — which, progress being monotonic, means at most one segment writes per frame.
- One passive `scroll` listener, one rAF, one observer, for the whole page. No per-node listener.
- Zero dependencies, and roughly 2 KB of JavaScript.

The drawn tip sits at 82% of the viewport height: ahead of the reader, and low enough that the hero's
approach run is complete on the first frame.

#### Entrance

The hero's sequence gains a seventh beat and re-orders around it — kicker, `educação`, `Financeira`,
the pill, the meta, the CTA, and **the date lockup last**, resolving as the line reaches it. The step
drops from 60 ms to 50 ms so seven beats still finish inside § 10.3's 700 ms ceiling. The line's
opening draw is the one moment `stroke-dashoffset` is ever transitioned (1100 ms); the first scroll
ends it, and the controller owns that number outright from then on.

#### The poster moment

The one piece of choreography that is not the shared `rise`: `translateY(34px) rotate(-1.6deg)
scale(0.972)` settling over 620 ms on first intersection. An object that only slides reads as a
slide; one that also loses a degree and a per cent reads as having been *placed*. Transform and
opacity only — the ground shadow beneath it is never animated (§ 14). It reuses the existing reveal
by overriding two custom properties rather than introducing a second mechanism.

#### Reduced motion

Not a faster version — a different one. The line is **present and complete**, drawn end to end, with
every node settled; the scroll listener is never attached and no frame work ever happens. The rings
do not render at all, and the poster is already placed. Removing the line would change what the page
*is* rather than how it arrives, which § 10.6 does not permit.

#### Where it does not go

`/privacidade` has no journey, no nodes and no controller. A privacy notice is not a marketing
experience.

#### The test it has to pass

With the animation removed the page must still look excellent. The line's absence costs the
composition nothing structural, because every node marks something that was already there.

### 10.9 The choreography — Phase 5.3

One page-wide rule: **each section has at most one primary kinetic behaviour**, and it belongs either
to the Journey Line or to that section's own subject. The rhythm is impact → movement → breath →
movement → climax → rest.

| Section | Its one behaviour |
| --- | --- |
| **Hero** | Maximum intensity: the counting rail's beads scrub with scroll, the line descends, merges briefly with one rail and lands on the date, the pointer tilts the object. |
| **O convite** | Deceleration. The poster's existing settle and the line passing behind it — nothing new. |
| **Detalhes** | Causality made literal: the facts resolve **because the line arrived**, not because a generic observer fired. |
| **Inscrição** | The climax, and it is one gesture: the form panel's border brightens once as the line reaches it, and settles. |
| **Realização e apoio** | Resolution. The line's head fades out where the line comes to rest. |

**The three drivers, and all three share one loop.** `FinancialJourney` already owns the page's only
passive scroll listener and its only `requestAnimationFrame`; Phase 5.3 adds work inside that frame
rather than a second loop:

- **Draw** — `stroke-dashoffset` per segment, as before (§ 10.8).
- **Head** — the exact tip of the drawn stroke, from `getPointAtLength` on the active segment only:
  a short brighter run of the stroke itself plus a small bloom. A concentration of energy at the
  leading end, never a dot travelling along a track.
- **Energy** — scroll speed, decayed each frame, written as one custom property on the active segment
  and mapped only to the head's length and opacity. A change of energy, never a change of style: the
  line's own weight and colour do not move. Off below 768px until it is profiled on a weak device.
- **Scrub** — the hero's scroll position, normalised over the counting rail's own height, smoothed by
  a convergence tail and written as one custom property. The rail's bead groups read it with
  different amplitudes and opposite signs (§ 7.4).

Everything above is reversible, stops when the reader stops, and does not exist under reduced motion.

---

## 11. Responsive behaviour

### 11.1 Breakpoints

| Name | Range | Composition |
| --- | --- | --- |
| `xs` | 320–359 | Single column, tightest gutters (16 px), display-1 at its floor |
| `sm` | 360–429 | **The design target.** Single column, 20 px gutters |
| `md` | 430–767 | Single column, roomier; date block gains width |
| `lg` | 768–1023 | **Its own composition** — date beside meta, logos in one row, details in two columns |
| `xl` | 1024–1439 | Asymmetric split hero (§ 5.1) |
| `2xl` | ≥ 1440 | Same as `xl`; content capped at 1200 px, gutters absorb the rest |

`lg` is a distinct composition, not an interpolation. That is the difference between a designed
response and a collapsed desktop layout.

The counting rail (§ 7.4) exists at `xl` and `2xl` only — 1024 px and above, the two ranges whose hero
actually has a right-hand region. Below that it is not rendered at all, so it costs a phone nothing.

### 11.2 Constraints that must hold at every width

- **No horizontal overflow, ever.** Optical clipping of display type is achieved with
  `overflow: clip` on the container — the document never exceeds the viewport width.
- **Touch targets ≥ 44 × 44 px**, inputs ≥ 48 px tall, with ≥ 8 px between adjacent targets.
- **Long names.** A 90-character name must wrap in the admin table and in the success panel without
  overflowing: `overflow-wrap: anywhere` on name cells, and a `max-width` in `ch`.
- **Long error messages** must not push the submit button off screen; the error summary is above the
  form for exactly this reason.
- **The phone mask** must not reflow its field at any width — the field is sized for its longest
  masked value.
- **Thumb zone.** On mobile, the primary CTA is always either in the hero (initial view) or in the
  sticky bar (after scroll). It is never only mid-page.
- **Dynamic viewport.** `svh`/`dvh` only. The hero must not jump when mobile browser chrome
  collapses.

### 11.3 Admin table

Covered in [ADMIN-SPEC.md § 5](./ADMIN-SPEC.md). The visual rule: **one semantic `<table>` at every
width**, with low-priority columns hidden below 640 px and a row-detail panel carrying the rest.
Never two parallel DOM trees for one dataset, and never a horizontally scrolling table as the mobile
answer.

---

## 12. Admin visual language

**Deliberately not the public page.** The public page carries the event's identity; the admin is a
quiet tool for people who will spend real minutes in it.

| Aspect | Public | Admin |
| --- | --- | --- |
| Scheme | Dark (`ink-900`) | **Light** — `#FFFFFF` surfaces on an `#F6F7FB` field |
| Type | Display contrast 300↔800 | One weight range, 400–700. No display sizes. |
| Density | Generous | Compact — 40 px table rows, 16/24 px section padding |
| Colour | Gold action, blue structure | Blue (`#0F4CB0`, darkened for AA on white) for actions; grey for everything; colour only for status |
| Motion | Entrance choreography | **None**, except `settle` on hover/focus and the 150 ms pending state |
| Radii | 20 px panels, pill buttons | 8 px panels, 6 px buttons. No pills. |

Reasoning: a dark, animated, pill-heavy admin would read as a crypto dashboard — explicitly excluded
by the brief. A light, dense, still interface reads as a professional tool, is easier on the eyes in
daylight at a venue door, and prints legibly.

**Continuity** is kept through three things only: the same typeface, the same 4 px spacing scale, and
`blue-500` as the accent lineage. Nothing else carries over.

**Status colours** (on white, all ≥ 4.5:1, each always paired with a text label):

| Status | Text | Fill |
| --- | --- | --- |
| `Confirmada` | `#0A6B3D` | `#E6F5EC` |
| `Lista de espera` | `#8A5000` | `#FFF4E0` |
| `Cancelada` | `#5B6478` | `#F0F1F5` |

The capacity meter is the only chart-like element in the admin: a single horizontal bar with a
confirmed segment (blue), a free segment (grey) and a waitlist overflow segment (amber, drawn
outside the capacity bounds). It answers a real operational question. No other chart exists — see
[ADMIN-SPEC.md § 4](./ADMIN-SPEC.md).

---

## 13. Accessibility as a design constraint

These are design decisions, not remediations. They were made here, not later.

1. **The action colour was chosen for contrast.** Gold on navy is 12.22:1; the alternative blue
   button would have failed even non-text contrast (§ 3.4).
2. **The field border colour was chosen for SC 1.4.11.** `border-strong` exists because the
   aesthetically obvious `ink-600` hairline is 1.36:1 and unusable as a control boundary (§ 3.6).
3. **Input font size is a design constant, not a preference** — 16 px minimum, because below it iOS
   zooms (§ 6.2).
4. **Labels are above fields**, because floating labels trade clarity for an animation (§ 9.2).
5. **Three text tiers, no opacity-based greys**, so contrast cannot silently regress (§ 3.3).
6. **The focus ring is part of the palette**, with a documented exception on gold (§ 9.3, § 9.5).
7. **Decorative type is `aria-hidden` and duplicated as real text** — the `19 SET` lockup is
   decorative; the date is also present in the meta line and the `<dl>` (§ 5.2).
8. **Reduced motion keeps interaction feedback**, removing only choreography (§ 10.6).
9. **Reveal animations are additive**, so no content depends on JavaScript to become visible
   (§ 10.5).
10. **Sticky elements reserve their own space** via `scroll-padding-bottom`, satisfying SC 2.4.11
    (§ 9.8).
11. **Status is never colour alone** — every pill carries its label (§ 12).
12. **The poster's `alt` text carries its information**, because the poster contains facts (§ 8.2).

---

## 14. Anti-pattern list

If any of these appears in the implementation, it is a defect regardless of how it looks.

**Composition**

- A centred headline followed by three cards of equal weight.
- A bento grid.
- Repeating feature sections with an icon, a bold line and two grey lines.
- Cards used as a default container for content that is a list.
- Every section with identical padding and identical structure.

**Colour and surface**

- Purple or violet-to-blue gradient blobs.
- Any gradient not listed in § 7.3.
- Glassmorphism / `backdrop-filter` anywhere.
- Border radius above 24 px on anything that is not a pill.
- More than three greys in the text palette.
- Colour as the sole carrier of meaning.

**Content**

- Fabricated statistics (`+500 jovens já participaram`).
- Fabricated testimonials or quotes.
- A live registration counter or any scarcity indicator.
- A countdown timer.
- Badge or pill clusters (`Gratuito` `2 horas` `Certificado` `Coffee break`) — this content belongs
  in the `<dl>`.
- An FAQ accordion invented to fill space.
- Any factual claim not in [EVENT-SOURCE-OF-TRUTH.md](./EVENT-SOURCE-OF-TRUTH.md).

**Motion and technology**

- WebGL / Three.js / Spline embeds. A CSS `perspective()` of a few degrees on one flat SVG is not an
  exception to this; a 3D scene, a loaded model or a material is.
- Scroll-jacking, scroll-snapping, scroll-driven parallax, scroll-linked scrubbing. (The two named
  exceptions, and their costs, are § 10.8 and § 7.4. Nothing else.)
- Looping animation of any kind.
- Animation on `filter`, `box-shadow`, `width`, `height` or layout properties.
- Animating more than ~8 elements at once.
- Content hidden by CSS awaiting JavaScript.
- A skeleton loader on the public page — it is server-rendered; there is nothing to skeleton.

**Forms**

- Placeholder text instead of a label.
- Floating labels.
- A multi-step wizard for three fields.
- A `disabled` submit button as the pending state.
- Success that depends on an animation finishing.
- Turnstile inserted without reserved height.
- `type="number"` for age.
- Inputs below 16 px.
