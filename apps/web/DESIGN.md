# ORCH Web UI — Design System

Dark, monospace-accented, terminal-adjacent theme for the ORCH web dashboard.
This doc is the design contract for the web UI — read it before building
any Tasks/Agents/Goals/Teams/Activity view. Token source of truth lives in
code, not here: `apps/web/src/theme/tokens.ts` (raw values) and
`apps/web/src/theme/preset.ts` (PrimeVue mapping). This file explains the
*why* and the component conventions; it does not restate every hex value.

## Thesis

ORCH web is the browser twin of `orch tui`, an Ink terminal app. The people
using it already live in terminals, tmux, `k9s`, `htop` — the UI's job is to
extend that world into a browser tab, not to look like a SaaS product with a
dashboard bolted on. Every screen should read as an operational instrument:
dense, legible, honest about state, quiet outside of the one thing that
needs attention.

**Explicitly avoided** (see calibration below): purple/indigo gradients,
neon-green-on-black "hacker" cliché, icon-in-colored-circle feature grids,
centered marketing-style hero copy, uniform bubbly border-radius, decorative
blobs/illustrations. None of that belongs in an ops tool.

## Palette

Two accents, not one — a warm/cool pair instead of the generic "one bright
accent on near-black" pattern:

| Token | Hex | Use |
|---|---|---|
| `ember.400` (primary) | `#E8A33D` | Primary actions, active/in-progress status. Amber-phosphor terminal accent — warm, desaturated, not orange-neon. |
| `signal.400` (secondary) | `#5FB3B3` | Links, focus ring, info/running. Cool cyan-teal, always distinct from primary so focus ≠ action ≠ status. |
| `ink.950` → `ink.0` | `#0B0D0C` → `#F4F5F4` | Surface/text ramp. Near-black with a faint cool-green undertone (phosphor-tube nod without literal green-on-black), never neutral gray or blue-slate. |
| `status.success` | `#5B9A6F` | Done / succeeded. Muted, not neon green. |
| `status.danger` | `#C1585A` | Failed / error / timed out. Muted brick red. |
| `status.warning` | = `ember.400` | Retrying / needs review. |
| `status.idle` | = `ink.400` | Todo / cancelled / disabled — deliberately unobtrusive. |

Rule: **status is never color-only.** Every status render pairs a glyph
(`○ ● ↻ ✓ ✗ ⊘ ◎`, see `theme/status.ts`) with its color and a text label.

## Typography

**IBM Plex Sans** (UI chrome — nav, buttons, headings, prose) + **IBM Plex
Mono** (data — IDs, timestamps, branch names, code, the activity feed).
These are one type family designed together for exactly this pairing, not
an arbitrary geometric-sans-plus-random-mono combo, and neither is Inter/
Roboto/Open Sans/Poppins (the "safe default" fonts to avoid per design
review conventions).

**New dependency required** (none exist yet — `apps/web` has no
`package.json` on `main`): `@fontsource/ibm-plex-sans` and
`@fontsource/ibm-plex-mono`, self-hosted (no third-party font CDN request,
full control over `font-display`, works offline). Weights needed: 400, 500,
600 for both families. Import the specific weight CSS files in
`main.ts`, e.g.:

```ts
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
```

**Density is deliberate.** Base UI text is 13px (`--p-text-sm`), not the
16px a marketing-site checklist would want — this is a dense operator
dashboard in the same class as Linear/GitHub's dense tables/`k9s`, read up
close at a desk. We never shrink the HTML root font-size to get there (that
would break browser zoom/accessibility) — only component-level font-size
tokens are reduced. Scale: `2xs` 11px (eyebrows) → `xs` 12px (captions,
timestamps) → `sm` 13px (default body) → `base` 14px (emphasized/primary
list content) → `md` 16px (section/dialog titles) → `lg` 20px (page titles)
→ `xl` 28px (rare — a big stat number, nothing else).

## Spacing, radius, motion

- **Spacing:** 4px base unit, tokens `space.05`…`space.16` (2px…64px). Use
  the scale; no arbitrary pixel values in component styles.
- **Radius:** restrained on purpose — `radius.sm` (2px) is the default for
  *everything* (cards, inputs, buttons, tags). `radius.md` (4px) exists only
  for floating overlays (menus, dialogs, popovers). `radius.full` only for
  true pills (status dot, avatar). Never apply one large uniform radius
  everywhere — that's the single most recognizable "AI-generated UI" tell.
- **Elevation:** hairline 1px borders (`var(--p-surface-600)`/`700`) between
  surfaces, not box-shadow glow — terminal panes are separated by rules, not
  drop shadows. Reserve shadow for things that truly float above content
  (menu/dialog/toast), and keep it subtle.
- **Motion:** 100–220ms, `transform`/`opacity` only, `ease-out` entering /
  `ease-in` exiting. Every animation must mean something (state changed,
  new data arrived) — no decorative motion. `prefers-reduced-motion` is
  handled globally in `theme/global.css`; don't re-implement it per
  component.

## Component conventions

- **Tables/lists:** dense rows (32–36px), hairline row dividers, hover
  highlight only — **no zebra striping** (terminal tables don't zebra).
- **Buttons:** text/outlined by default (reads like a CLI flag, not a call
  to action); solid/filled reserved for the single primary action per view.
  Radius always `{radius.sm}`.
- **Cards/panels:** `ink.800` background, 1px `ink.600` border, `radius.sm`,
  no shadow. Panel headers use the `.ow-eyebrow` utility class (mono,
  11px, uppercase, tracked) — mirrors the TUI's column headers.
- **Status rendering:** always go through `theme/status.ts`
  (`taskStatus`/`agentStatus`/`runStatus` maps) for glyph + color + label.
  Do not hand-roll a new status→color mapping in a component. Build one
  shared `StatusDot`/`StatusBadge` component that reads these maps rather
  than repeating the glyph/color/label triplet inline everywhere.
- **IDs, timestamps, branch names, code:** always `.mono` /
  `var(--p-font-mono)`, tabular numerals. Everything else (labels, buttons,
  prose, nav) stays in the sans face. This split is the main visual
  language of the app — don't blur it.
- **Forms:** hairline borders; hover border = primary (`ember`), focus
  border/ring = secondary (`signal`/cyan) — so a focused field is never
  visually confused with a "this is clickable" or "this succeeded" signal.
  Never remove `:focus-visible` without the replacement already defined in
  `theme/global.css`.
- **Empty states:** a mono, prompt-style line (`$ no tasks yet`) plus one
  primary action — matches the CLI's own "nothing to show" convention.
  Never a generic illustration/blob for an empty state.
- **Errors:** specific, state what happened and the next step, in the
  interface's voice — not "Something went wrong."
- **Loading:** skeleton shapes sized to the real content they'll become, in
  `ink.700`; no generic spinner-only loading for list/table content.

## Signature element

The **live activity feed** (Activity tab, SSE event stream) is styled as an
actual terminal scrollback, not a generic notification list: mono font,
dim-gray (`ink.300`) timestamps, a colored status glyph per line, new lines
entering with `.ow-feed-line-in` (120ms fade + 4px slide), and a blinking
block cursor (`.ow-cursor`) at the bottom when live-tailing — implemented in
`theme/global.css`, static (no blink) under `prefers-reduced-motion`. This
is the one deliberate flourish in the whole system; everything else stays
quiet so this reads as *the* signature, not one of many.

## Accessibility floor

- Focus is always visible (`:focus-visible` ring, secondary/cyan, 2px,
  2px offset) — never `outline: none` without it.
- Status never relies on color alone (glyph + color + label, always).
- Body text stays real px-based tokens (no root-font-size hacks) so browser
  zoom keeps working.
- Reduced motion respected globally (see `theme/global.css`).
- Dark-only for v1 is a decision, not an oversight — see below.

## Decisions

- **Dark-only in v1.** The app targets people already working in a dark
  terminal; a real light mode is out of scope until asked for. PrimeVue
  still requires *some* `colorScheme.light` values to exist structurally —
  `preset.ts` fills them with PrimeVue's own stock `zinc` surface,
  explicitly marked as an undesigned fallback, not a second theme. Don't
  extend the light branch without a deliberate decision to ship one.
- **Status enums came from the library, not guesswork.** `TaskStatus`,
  `AgentStatus`, `RunStatus` in `theme/status.ts` are copied from
  `@oxgeneral/orch`'s shipped `dist/index.d.ts` (`todo | in_progress |
  retrying | review | done | failed | cancelled` for tasks; `idle | running
  | error | disabled` for agents; `preparing | running | succeeded | failed
  | timed_out | cancelled` for runs) — not invented ad hoc, so components
  built against these maps won't need a rename pass later.
- **PrimeVue `Aura` used as the structural base for `definePreset`,** per
  PrimeVue v4's own recommended pattern for building a fully custom theme.
  Every token that's visibly ORCH's own (primary, surface ramp, focus ring,
  radius, fonts, status colors) is overridden; Aura only supplies the token
  *shape* other components read from.
- **App-level tokens (spacing/type/motion/status) are exposed as
  `--p-*` CSS custom properties via PrimeVue's `extend` token group,**
  not hand-duplicated into `global.css` as literal values. This keeps
  `tokens.ts` the single source of truth — change a color once, it updates
  everywhere (PrimeVue components and plain CSS alike).
- **Component-token overrides are intentionally shallow right now**
  (`button`, `card`, `formField` only — the ones confirmed against
  PrimeVue's documented v4 preset shape). Deeper per-component tokens
  (DataTable density, Tag/Badge severity backgrounds, etc.) were not
  guessed blind. When you build a component that needs one, check the
  generated `--p-<component>-*` variable names in devtools first,
  then add it to `preset.ts`'s `components` block — don't inline a raw hex.

## File map

```
apps/web/src/theme/
  tokens.ts    raw values — color/type/space/radius/motion (source of truth)
  status.ts    TaskStatus/AgentStatus/RunStatus -> {glyph, color, label}
  preset.ts    definePreset(Aura, ...) — maps tokens.ts into PrimeVue
  global.css   base layer: reset, scrollbar, focus-visible, feed animation
  index.ts     barrel export — import from '@/theme' in main.ts
apps/web/DESIGN.md   this file
```
