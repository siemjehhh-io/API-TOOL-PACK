# Design System

In-repo developer guide for the UI/UX redesign system used across the WD
Data Extractor app (and the wider API Formula Tools surface). Use this
document as the day-to-day reference when building or refactoring UI.

For full context — architecture, acceptance criteria, visual diagrams,
and worked examples — see the spec at
[`.kiro/specs/ui-ux-redesign-system/`](../../.kiro/specs/ui-ux-redesign-system/).
This document focuses on what's actually wired up in code and how to use it.

---

## 1. Utility Namespacing Strategy

The design system is layered on top of the existing shadcn/ui setup. To
avoid clobbering shadcn utilities while still exposing first-class design
system utilities, we use a deliberate split:

- **Spacing utilities use direct names** — no prefix.
  Tailwind's spacing theme is extended directly with the design scale, so
  every spacing-driven utility (padding, margin, gap, space-between,
  width/height, inset, etc.) accepts the design tokens by name.

  ```text
  p-md      px-lg     py-sm     m-xs      mt-xl
  gap-lg    gap-x-md  gap-y-sm  space-x-md
  w-xxl     h-xl      inset-md  -mx-sm
  ```

- **Design system colors use the `ds-` prefix.**
  Existing shadcn color utilities (`bg-primary`, `text-secondary`,
  `border-border`, `bg-card`, `bg-background`, etc.) are preserved
  unchanged. Design system colors are exposed under a parallel `ds-`
  namespace so the two sets coexist cleanly.

  ```text
  bg-ds-primary           text-ds-success        border-ds-danger
  bg-ds-card              text-ds-text-primary   border-ds-border
  ```

- **Design system shadows use the `ds-` prefix.**
  Tailwind's built-in `shadow-sm` / `shadow-md` / `shadow-lg` /
  `shadow-xl` are kept as-is. The design system elevation scale is
  available under `shadow-ds-*`.

  ```text
  shadow-ds-sm   shadow-ds-md   shadow-ds-lg   shadow-ds-xl
  ```

- **Design system radii use the `ds-` prefix.**
  Existing `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl`
  derive from shadcn's `--radius` and remain unchanged. The design
  system radius scale is available under `rounded-ds-*`.

  ```text
  rounded-ds-sm   rounded-ds-md   rounded-ds-lg
  rounded-ds-xl   rounded-ds-2xl
  ```

- **Existing shadcn utilities are preserved.**
  Any component currently relying on `bg-card`, `text-foreground`,
  `border-border`, `rounded-lg`, `shadow-sm`, etc. continues to work
  exactly as before. The `ds-` namespace is additive, not replacement.

---

## 2. File Structure

The design system is implemented in two files:

- **Source tokens** — `src/styles/design-tokens.css`
  Single source of truth. Defines all design primitives as CSS custom
  properties on `:root` (spacing, colors, shadows, border radii). Tokens
  are documented inline with their intended usage.

- **Tailwind theme mapping** — `src/index.css` (inside the
  `@theme inline { … }` block)
  Imports `design-tokens.css` and maps the tokens onto Tailwind v4
  theme keys so utilities are generated. This is also where the
  `ds-` namespacing decisions are made (see Section 1).

Anything else (component styles, glass helpers, animated background,
shadcn variables) lives in `src/index.css` and is unaffected by the
design system layer.

When changing tokens, update `design-tokens.css` first, then verify
the corresponding mapping in the `@theme inline` block of `index.css`
still reflects the intent.

---

## 3. Available Utilities — Quick Reference

### 3.1 Spacing

| Token | Value     | Pixels | Common utilities                         |
| ----- | --------- | ------ | ---------------------------------------- |
| `xs`  | 0.25rem   | 4px    | `p-xs`, `gap-xs`, `mt-xs`, `space-x-xs`  |
| `sm`  | 0.5rem    | 8px    | `p-sm`, `gap-sm`, `py-sm`, `mb-sm`       |
| `md`  | 1rem      | 16px   | `p-md`, `gap-md`, `px-md`, `mx-md`       |
| `lg`  | 1.5rem    | 24px   | `p-lg`, `gap-lg`, `py-lg`, `mt-lg`       |
| `xl`  | 2rem      | 32px   | `p-xl`, `gap-xl`, `px-xl`, `mb-xl`       |
| `xxl` | 3rem      | 48px   | `p-xxl`, `gap-xxl`, `py-xxl`, `mt-xxl`   |

These tokens work with every spacing-driven Tailwind utility (padding,
margin, gap, space-between, width, height, inset, translate, etc.).

#### Spacing Examples — Real-World Usage

The tokens slot into Tailwind's standard utility shapes, so the same
`xs / sm / md / lg / xl / xxl` names compose with every prefix. A few
concrete examples:

```html
<!-- Uniform 16px padding on all sides -->
<div class="p-md">…</div>

<!-- 24px gap between flex/grid children -->
<div class="flex gap-lg">…</div>

<!-- 24px horizontal padding, 16px vertical padding, 8px gap -->
<div class="flex px-lg py-md gap-sm">…</div>

<!-- 32px top margin, 8px bottom margin, 4px right padding -->
<div class="mt-xl mb-sm pr-xs">…</div>

<!-- Section: 24px padding all around, 24px gap between blocks -->
<section class="px-lg py-lg gap-lg flex flex-col">…</section>

<!-- Responsive: 16px padding on mobile, 24px on tablet, 32px on desktop -->
<div class="p-md sm:p-lg lg:p-xl">…</div>

<!-- Grid with 16px gap between cells -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-md">…</div>

<!-- Asymmetric grid gap: 24px between columns, 16px between rows -->
<div class="grid grid-cols-2 gap-x-lg gap-y-md">…</div>

<!-- Fixed-size square: 48px × 48px -->
<div class="w-xxl h-xxl">…</div>

<!-- Negative margin to bleed into parent padding -->
<div class="-mx-md">…</div>
```

#### How the Tokens Compose with Tailwind Utilities

The design tokens are registered on Tailwind's spacing scale, so they
behave like any other built-in spacing value. That means:

- **Every spacing utility accepts them by name.** Padding (`p-*`,
  `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`), margin (`m-*`,
  `mx-*`, `my-*`, …), gap (`gap-*`, `gap-x-*`, `gap-y-*`),
  space-between (`space-x-*`, `space-y-*`), sizing (`w-*`, `h-*`,
  `min-w-*`, `max-h-*`, …), inset (`top-*`, `inset-*`, …), translate
  (`translate-x-*`), and scroll padding all accept `xs … xxl`.

- **They support modifiers and variants like any other utility.** Pair
  them with responsive prefixes (`sm:`, `md:`, `lg:`), state variants
  (`hover:`, `focus:`, `group-hover:`), dark mode (`dark:`), and
  arbitrary-position prefixes the same way you would use `p-4` or
  `gap-2`.

- **Negative values work where Tailwind already supports them.** Use
  `-mt-md` for a 16px negative top margin, `-mx-sm` for an 8px
  horizontal pull, etc.

- **They mix freely with shadcn and Tailwind defaults.** The tokens
  do not replace the existing numeric scale; both are available
  simultaneously. Prefer the named tokens in design-system contexts
  so spacing intent stays readable in the markup.

### 3.2 Colors

| Utility name              | Value (HSL)         | Role                       |
| ------------------------- | ------------------- | -------------------------- |
| `ds-primary`              | `hsl(248 80% 68%)`  | Brand violet               |
| `ds-primary-dark`         | `hsl(248 50% 22%)`  | Darker accent              |
| `ds-secondary`            | `hsl(238 28% 16%)`  | Dark slate                 |
| `ds-success`              | `hsl(175 70% 48%)`  | Success / teal             |
| `ds-warning`              | `hsl(35 90% 58%)`   | Warning / amber            |
| `ds-danger`               | `hsl(0 65% 50%)`    | Danger / red               |
| `ds-background`           | `hsl(238 35% 7%)`   | App background             |
| `ds-card`                 | `hsl(238 30% 10%)`  | Card surface               |
| `ds-border`               | `hsl(238 28% 18%)`  | Divider / border           |
| `ds-text-primary`         | `hsl(240 25% 93%)`  | Primary foreground         |
| `ds-text-secondary`       | `hsl(238 18% 52%)`  | Muted foreground           |

Each color is available everywhere a color utility is expected:
`bg-ds-*`, `text-ds-*`, `border-ds-*`, `ring-ds-*`, `fill-ds-*`,
`stroke-ds-*`, etc.

### 3.3 Shadows

| Utility           | Value                                |
| ----------------- | ------------------------------------ |
| `shadow-ds-sm`    | `0 1px 2px rgba(0, 0, 0, 0.05)`      |
| `shadow-ds-md`    | `0 4px 6px rgba(0, 0, 0, 0.1)`       |
| `shadow-ds-lg`    | `0 10px 15px rgba(0, 0, 0, 0.1)`     |
| `shadow-ds-xl`    | `0 20px 25px rgba(0, 0, 0, 0.1)`     |

### 3.4 Border Radii

| Utility              | Value     | Pixels | Role                       |
| -------------------- | --------- | ------ | -------------------------- |
| `rounded-ds-sm`      | 0.625rem  | 10px   | Standard radius            |
| `rounded-ds-md`      | 0.75rem   | 12px   | Buttons, controls          |
| `rounded-ds-lg`      | 0.875rem  | 14px   | Large containers           |
| `rounded-ds-xl`      | 1rem      | 16px   | Card containers            |
| `rounded-ds-2xl`     | 1.25rem   | 20px   | Section containers         |

---

## 4. When to Use What

The design system models the UI as a four-level container hierarchy.
Each level has a recommended set of utilities. Reach for the level
that matches the role of the element you are building.

### Hierarchy at a Glance

```text
┌─ Level 1: Page Container ───────────────────────────────────┐
│  max-w-5xl · px-md py-xl · gap-lg                           │
│                                                             │
│  ┌─ Level 2: Section Container ─────────────────────────┐   │
│  │  px-lg py-lg · rounded-ds-2xl · glass · gap-lg       │   │
│  │                                                      │   │
│  │  ┌─ Level 3: Card / Box ──────────────────────────┐  │   │
│  │  │  px-md py-md · rounded-ds-xl · bg-white/5      │  │   │
│  │  │  shadow-ds-sm · gap-md                         │  │   │
│  │  │                                                │  │   │
│  │  │  ┌─ Level 4: Control Panel ─────────────────┐  │  │   │
│  │  │  │  px-md py-sm · rounded-ds-md · gap-sm    │  │  │   │
│  │  │  └──────────────────────────────────────────┘  │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

Padding steps **down by one** at each level (`xl → lg → md → sm`),
producing a clear visual hierarchy without crowding. See the
[Nesting Rule](#nesting-rule) below for the full guidance, and
[`VISUAL_REFERENCE.md`](../../.kiro/specs/ui-ux-redesign-system/VISUAL_REFERENCE.md)
for detailed per-level diagrams.

### Level 1 — Page Container (outermost)

The top-level wrapper that centers the page and defines the overall
breathing room.

- Padding: `px-md py-xl` on mobile, scaling up on larger viewports
  (e.g. `px-md sm:px-lg lg:px-xl py-xl lg:py-xxl`)
- Width: `max-w-5xl mx-auto`
- Vertical rhythm between sections: `gap-lg`

### Level 2 — Section Container (major sections)

A grouped block of related content (upload zone, controls, stats,
table, etc.). Uses generous padding, large radius, and the glass
effect.

- Padding: `px-lg py-lg`
- Radius: `rounded-ds-2xl`
- Surface: `glass` (or `bg-ds-card` for non-glass contexts)
- Border: `border border-white/10`
- Internal gap between sub-blocks: `gap-lg`

### Level 3 — Card / Box Container (sub-sections)

Cards inside a section: stat cards, data cards, sub-panels.

- Padding: `px-md py-md` (use `px-lg py-lg` for prominent stat cards)
- Radius: `rounded-ds-xl`
- Surface: `bg-white/5`
- Border: `border border-white/10`
- Elevation: `shadow-ds-sm`
- Internal gap: `gap-md`

### Level 4 — Control Panel (inputs, buttons, control rows)

The smallest grouping: form controls, button rows, individual
controls inside a card.

- Padding: `px-md py-sm`
- Radius: `rounded-ds-md` (12px) — matches button radius
- Surface: `bg-white/5`
- Border: `border border-white/10`
- Internal gap: `gap-sm`

### Nesting Rule

Step the spacing scale **down by one** when nesting. A Level 2 section
using `p-lg` should contain Level 3 cards using `p-md`, which in turn
contain Level 4 controls using `p-sm` (vertical) / `p-md` (horizontal).
This produces a clear visual hierarchy without crowding.

### Picking a Color

- `bg-ds-primary` — primary call-to-action, active state of a tab,
  selected toggle
- `bg-ds-success` / `bg-ds-warning` / `bg-ds-danger` — status badges,
  toasts, validation messages
- `bg-ds-card` — opaque card surface where the glass effect is not
  appropriate
- `bg-ds-background` — app-level background fill
- `text-ds-text-primary` — primary copy
- `text-ds-text-secondary` — labels, helper text, captions
- `border-ds-border` — neutral dividers when not using `border-white/10`

### Picking a Shadow

- `shadow-ds-sm` — cards and surfaces with subtle lift (Level 3)
- `shadow-ds-md` — dropdowns, tooltips, hovering controls
- `shadow-ds-lg` — modals, dialogs, sheets
- `shadow-ds-xl` — floating panels, popovers with strong elevation

### Picking a Radius

Match the radius to the container level:

- Buttons / inputs / control panels → `rounded-ds-md`
- Cards / boxes (Level 3) → `rounded-ds-xl`
- Sections (Level 2) → `rounded-ds-2xl`

---

## 5. Component Specifications

Concrete specs for the four core component types. Use these as the
default starting point and only deviate when the surrounding context
requires it. All values map to the utilities documented in Sections 1–3.

### 5.1 Buttons

Three sizes cover the full button system. Pick the smallest size that
still hits the touch target you need.

| Size | Height | Padding         | Font        | Gap      | Radius          |
| ---- | ------ | --------------- | ----------- | -------- | --------------- |
| `xs` | `h-8`  | `px-2.5 py-1`   | `text-xs`   | `gap-xs` | `rounded-ds-md` |
| `sm` | `h-10` | `px-md py-2.5`  | `text-sm`   | `gap-sm` | `rounded-ds-xl` |
| `md` | `h-12` | `px-lg py-sm`   | `text-base` | `gap-sm` | `rounded-ds-xl` |

All sizes share `font-semibold` and `inline-flex items-center justify-center`.

**States** (apply on top of the size classes above):

```text
Default:    border border-white/10 text-white/50
            hover: bg-white/5 border-white/20 text-white/80

Active:     bg-ds-primary border border-ds-primary text-white
            shadow-ds-md

Disabled:   opacity-35 cursor-not-allowed
            (skip hover styles)
```

**Example markup** — three sizes plus active and disabled states:

```html
<!-- xs (h-8) -->
<button
  class="inline-flex items-center justify-center font-semibold
         h-8 px-2.5 py-1 text-xs gap-xs rounded-ds-md
         border border-white/10 text-white/50
         hover:bg-white/5 hover:border-white/20 hover:text-white/80"
>
  Cancel
</button>

<!-- sm (h-10) -->
<button
  class="inline-flex items-center justify-center font-semibold
         h-10 px-md py-2.5 text-sm gap-sm rounded-ds-xl
         border border-white/10 text-white/50
         hover:bg-white/5 hover:border-white/20 hover:text-white/80"
>
  Export
</button>

<!-- md (h-12), active state -->
<button
  class="inline-flex items-center justify-center font-semibold
         h-12 px-lg py-sm text-base gap-sm rounded-ds-xl
         bg-ds-primary border border-ds-primary text-white shadow-ds-md"
>
  Save changes
</button>

<!-- sm, disabled -->
<button
  disabled
  class="inline-flex items-center justify-center font-semibold
         h-10 px-md py-2.5 text-sm gap-sm rounded-ds-xl
         border border-white/10 text-white/50
         opacity-35 cursor-not-allowed"
>
  Submit
</button>
```

### 5.2 Input Fields

Single canonical size; pair with a label using the input-group pattern
shown below.

```text
Input:      h-10 px-3 py-sm text-sm rounded-ds-md
            bg-white/5 border border-white/10
            placeholder:text-white/25 transition-all

Focus:      focus:ring-1 focus:ring-ds-primary/50
            focus:border-ds-primary/40

Disabled:   opacity-35 cursor-not-allowed
```

**Input group** (label + input + optional helper):

```text
Wrapper:    flex flex-col gap-sm
Label:      text-xs font-medium text-ds-text-secondary
Helper:     text-xs text-ds-text-secondary mt-xs
```

**Example markup** — complete input group with label and helper text:

```html
<div class="flex flex-col gap-sm">
  <label
    for="account-name"
    class="text-xs font-medium text-ds-text-secondary"
  >
    Account name
  </label>
  <input
    id="account-name"
    type="text"
    placeholder="e.g. Main wallet"
    class="h-10 px-3 py-sm text-sm rounded-ds-md
           bg-white/5 border border-white/10
           placeholder:text-white/25 transition-all
           focus:ring-1 focus:ring-ds-primary/50 focus:border-ds-primary/40"
  />
  <p class="text-xs text-ds-text-secondary mt-xs">
    Used as a label in the queue list. Letters and numbers only.
  </p>
</div>
```

### 5.3 Cards

Two card variants cover the common cases. Both sit at Level 3 of the
container hierarchy.

**Standard Card** — content card with optional header.

```text
Outer:      px-lg py-lg rounded-ds-xl bg-white/5
            border border-white/10 shadow-ds-sm
Header:     py-sm border-b border-white/10
Body:       px-md py-md gap-md
```

**Stat Card** — compact metric card (label, value, subtitle).

```text
Container:  px-lg py-lg rounded-ds-xl bg-white/5
            border border-white/10 shadow-ds-sm
            flex flex-col gap-sm
Label:      text-xs text-ds-text-secondary
Value:      text-2xl font-bold text-ds-text-primary
Subtitle:   text-xs text-ds-text-secondary
Icon:       absolute top-md right-md (when present)
```

**Example markup** — Standard Card and Stat Card:

```html
<!-- Standard Card -->
<article
  class="px-lg py-lg rounded-ds-xl bg-white/5
         border border-white/10 shadow-ds-sm"
>
  <header class="py-sm border-b border-white/10">
    <h3 class="text-sm font-semibold text-ds-text-primary">
      Recent withdrawals
    </h3>
  </header>
  <div class="px-md py-md flex flex-col gap-md">
    <p class="text-sm text-ds-text-primary">
      Five entries processed in the last hour.
    </p>
    <p class="text-xs text-ds-text-secondary">
      Updated automatically every 30 seconds.
    </p>
  </div>
</article>

<!-- Stat Card -->
<div
  class="relative px-lg py-lg rounded-ds-xl bg-white/5
         border border-white/10 shadow-ds-sm
         flex flex-col gap-sm"
>
  <span class="text-xs text-ds-text-secondary">Total volume</span>
  <span class="text-2xl font-bold text-ds-text-primary">Rp 12,450,000</span>
  <span class="text-xs text-ds-text-secondary">+8.2% vs yesterday</span>
  <span
    class="absolute top-md right-md w-xl h-xl rounded-ds-md
           bg-ds-primary/20 text-ds-primary
           flex items-center justify-center text-sm"
    aria-hidden="true"
  >
    ↑
  </span>
</div>
```

### 5.4 Tables

Wrap tables in a Level 2 section container with `overflow-x-auto` so
they scroll horizontally on narrow viewports.

```text
Wrapper:    px-lg py-lg rounded-ds-2xl glass
            border border-white/10 overflow-x-auto

Header (th):
            px-md py-sm bg-white/5
            border-b border-white/10
            text-xs font-semibold uppercase text-ds-text-secondary

Row (tr):   border-b border-white/10
            hover:bg-white/5 transition-colors

Cell (td):  px-sm py-md text-sm text-ds-text-primary
```

Use `text-right` on numeric columns and reserve a narrower first
column (`w-xl` or similar) for row-number / index cells.

**Example markup** — complete table with header and three rows:

```html
<div
  class="px-lg py-lg rounded-ds-2xl glass
         border border-white/10 overflow-x-auto"
>
  <table class="w-full text-left">
    <thead>
      <tr>
        <th
          class="w-xl px-md py-sm bg-white/5 border-b border-white/10
                 text-xs font-semibold uppercase text-ds-text-secondary"
        >
          #
        </th>
        <th
          class="px-md py-sm bg-white/5 border-b border-white/10
                 text-xs font-semibold uppercase text-ds-text-secondary"
        >
          Account
        </th>
        <th
          class="px-md py-sm bg-white/5 border-b border-white/10
                 text-xs font-semibold uppercase text-ds-text-secondary
                 text-right"
        >
          Amount
        </th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-white/10 hover:bg-white/5 transition-colors">
        <td class="px-sm py-md text-sm text-ds-text-secondary">1</td>
        <td class="px-sm py-md text-sm text-ds-text-primary">Main wallet</td>
        <td class="px-sm py-md text-sm text-ds-text-primary text-right">
          Rp 2,500,000
        </td>
      </tr>
      <tr class="border-b border-white/10 hover:bg-white/5 transition-colors">
        <td class="px-sm py-md text-sm text-ds-text-secondary">2</td>
        <td class="px-sm py-md text-sm text-ds-text-primary">Reserve</td>
        <td class="px-sm py-md text-sm text-ds-text-primary text-right">
          Rp 1,200,000
        </td>
      </tr>
      <tr class="border-b border-white/10 hover:bg-white/5 transition-colors">
        <td class="px-sm py-md text-sm text-ds-text-secondary">3</td>
        <td class="px-sm py-md text-sm text-ds-text-primary">Operations</td>
        <td class="px-sm py-md text-sm text-ds-text-primary text-right">
          Rp 875,000
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 6. Responsive Breakpoints

The design system targets three viewport bands. Each band changes
column count, container padding, and inter-element gap so layouts feel
breathable at every size without rewriting the markup.

### Standard Breakpoints

Breakpoints map directly to Tailwind v4's defaults — no custom media
queries needed. Compose responsive utilities by stacking the prefix in
front of any spacing or sizing token (e.g.
`gap-sm sm:gap-md lg:gap-lg`).

| Band    | Viewport         | Tailwind prefix | Columns | Container padding | Gap      |
| ------- | ---------------- | --------------- | ------- | ----------------- | -------- |
| Mobile  | `< 640px`        | _(default)_     | 1       | `px-md py-lg`     | `gap-sm` |
| Tablet  | `640px – 1024px` | `sm:`           | 2       | `px-lg py-xl`     | `gap-md` |
| Desktop | `≥ 1024px`       | `lg:`           | 3       | `px-lg py-xxl`    | `gap-lg` |

Notes:

- **Mobile-first.** Unprefixed utilities apply at every viewport; `sm:`
  and `lg:` only kick in once the viewport reaches that breakpoint.
  There is no separate "mobile" prefix.
- **Why skip `md:`?** The system jumps from tablet (`sm:`, ≥ 640px) to
  desktop (`lg:`, ≥ 1024px) because the `md:` band (≥ 768px) does not
  introduce a new layout. Reach for `md:` only when a specific
  component genuinely needs an in-between step.
- **Step font sizes down on mobile.** Reduce headings and body copy by
  one step on the smallest viewport (e.g. `text-2xl sm:text-3xl`,
  `text-sm sm:text-base`) so dense screens stay readable.

### Composing Responsive Utilities

The same `xs … xxl` tokens that work on the default scale also work
behind every breakpoint prefix. The patterns below are the ones you
will reach for most often.

#### Responsive padding (Level 1 page wrapper)

```html
<main
  class="max-w-5xl mx-auto px-md py-lg sm:px-lg sm:py-xl lg:py-xxl gap-lg"
>
  …
</main>
```

Padding grows from 16px / 24px on mobile, to 24px / 32px on tablet, to
24px / 48px on desktop, matching the band table above.

#### Responsive grid columns

```html
<!-- Stats / cards: 1 → 2 → 3 columns -->
<div
  class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm sm:gap-md lg:gap-lg"
>
  …
</div>
```

The column count and gap both track the band, so a single declaration
covers all three viewports.

#### Responsive section container

```html
<section
  class="px-md py-lg sm:px-lg sm:py-xl lg:py-xxl
         rounded-ds-2xl glass border border-white/10
         flex flex-col gap-sm sm:gap-md lg:gap-lg"
>
  …
</section>
```

#### Responsive typography

```html
<h2 class="text-xl sm:text-2xl lg:text-3xl font-semibold">…</h2>
<p class="text-xs sm:text-sm">…</p>
```

Step the font scale up at `sm:` and `lg:`, mirroring the spacing scale
so density stays balanced.

### Avoiding Horizontal Scroll

- Always pair full-width data tables with `overflow-x-auto` on the
  wrapper (see Section 5.4).
- Avoid fixed widths on inner content; prefer `w-full` plus the column
  tokens above.
- Reserve `min-w-*` only for elements that genuinely need a floor
  (icons, badges, sticky action buttons).

For visual diagrams of how each breakpoint reflows the standard
layouts, see the responsive breakpoints section of
[`VISUAL_REFERENCE.md`](../../.kiro/specs/ui-ux-redesign-system/VISUAL_REFERENCE.md).

---

## 7. Cheat Sheet

A minimal, copy-pasteable reference for the most common cases.

```text
Page wrapper:        max-w-5xl mx-auto px-md py-xl gap-lg
Section:             px-lg py-lg rounded-ds-2xl glass border border-white/10 gap-lg
Card:                px-md py-md rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm
Stat card:           px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm
Control row:         px-md py-sm rounded-ds-md bg-white/5 border border-white/10
Grid (responsive):   grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md
Active accent:       bg-ds-primary text-white shadow-ds-md
```

---

## 8. Further Reading

For deeper context beyond this in-repo guide:

- [`IMPLEMENTATION_GUIDE.md`](../../.kiro/specs/ui-ux-redesign-system/IMPLEMENTATION_GUIDE.md)
  — worked code examples, responsive patterns, common mistakes,
  troubleshooting, and a code-review checklist.
- [`VISUAL_REFERENCE.md`](../../.kiro/specs/ui-ux-redesign-system/VISUAL_REFERENCE.md)
  — ASCII diagrams of container hierarchy, button sizes, input
  states, table layouts, color palette, shadow hierarchy, and
  responsive breakpoints.
- [`design.md`](../../.kiro/specs/ui-ux-redesign-system/design.md)
  — full technical design document.
- [`requirements.md`](../../.kiro/specs/ui-ux-redesign-system/requirements.md)
  — acceptance criteria.

If a token, utility, or rule in this document conflicts with the
spec, the spec is the source of truth. Update this document to
match, and adjust the implementation in `src/styles/design-tokens.css`
and `src/index.css` accordingly.
