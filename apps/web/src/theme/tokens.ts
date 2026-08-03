/**
 * ORCH Web UI — design token primitives.
 *
 * Single source of truth for raw color/type/space/radius/motion values.
 * `preset.ts` maps these into PrimeVue's semantic/primitive token graph.
 * `status.ts` maps task/agent/run status → these same colors.
 *
 * Do not import PrimeVue here — this file must stay framework-agnostic so it
 * can also be read by non-Vue tooling (e.g. a future Storybook or a lint rule
 * that forbids raw hex in components).
 */

/**
 * `ink` — the surface/grayscale ramp. A near-black with a faint cool-green
 * undertone (not neutral gray, not blue-slate) — a nod to phosphor-tube
 * terminals without being a literal green-on-black cliché. Ascending index =
 * darker, matching PrimeVue's primitive scale convention (0 = lightest).
 */
export const ink = {
  0: '#F4F5F4',
  50: '#E4E6E5',
  100: '#C9CDCB',
  200: '#A6ACAA',
  300: '#7C8482',
  400: '#5B6362',
  500: '#3B4241',
  600: '#2E3433',
  700: '#232827',
  800: '#1A1E1D',
  900: '#121514',
  950: '#0B0D0C',
} as const;

/**
 * `ember` — primary accent. Warm, desaturated amber (amber-phosphor VT220
 * terminals), deliberately NOT the neon-green or purple/indigo gradients that
 * dominate AI-generated dark UIs. Used for primary actions and the
 * "in-progress / active" status.
 */
export const ember = {
  50: '#FBF1DE',
  100: '#F5DFB3',
  200: '#EFCB86',
  300: '#E9B85C',
  400: '#E8A33D',
  500: '#D6912E',
  600: '#B87724',
  700: '#96601D',
  800: '#714817',
  900: '#4D3110',
  950: '#2E1D09',
} as const;

/**
 * `signal` — secondary accent. Cool cyan-teal, used for links, focus rings,
 * and informational/"running" affordances. Pairs with `ember` as a warm/cool
 * duo instead of a single-accent-on-black scheme.
 */
export const signal = {
  50: '#E4F5F3',
  100: '#BFE6E2',
  200: '#97D6CF',
  300: '#6FC5BC',
  400: '#5FB3B3',
  500: '#479A9A',
  600: '#367C7C',
  700: '#275F5F',
  800: '#1A4444',
  900: '#102A2A',
  950: '#081717',
} as const;

/**
 * Semantic status colors, deliberately distinct from both accents so status
 * (what happened) never gets visually confused with interaction affordance
 * (what you can click) or focus.
 */
export const status = {
  success: '#5B9A6F', // done / passed
  danger: '#C1585A', // failed / error
  warning: ember[400], // needs attention / blocked
  info: signal[400], // running / in progress
  idle: ink[400], // todo / pending / cancelled
} as const;

/** Font stacks. IBM Plex Sans + IBM Plex Mono: one family, two purposes, designed together — not an arbitrary geometric-sans + Inter pairing. */
export const font = {
  sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
} as const;

/**
 * Type scale. Base app density is intentionally smaller than typical
 * marketing-site guidance (16px body) — this is an operator dashboard read
 * at a desk, not a landing page; 13px dense defaults match the class of tool
 * it sits next to (terminal multiplexers, `k9s`, `htop`, Linear, GitHub's
 * dense tables). We never shrink the HTML root font-size (that would break
 * browser zoom/a11y) — only component-level font-size tokens are reduced.
 */
export const text = {
  '2xs': '0.6875rem', // 11px — eyebrows, uppercase tracked labels
  xs: '0.75rem', // 12px — captions, timestamps, table meta
  sm: '0.8125rem', // 13px — default UI/body text
  base: '0.875rem', // 14px — emphasized body, primary list content
  md: '1rem', // 16px — section/dialog headers
  lg: '1.25rem', // 20px — page titles
  xl: '1.75rem', // 28px — rare: big stat numbers only
} as const;

export const lineHeight = {
  mono: 1.4, // feed/code blocks — tight, terminal-like
  body: 1.5,
  heading: 1.2,
} as const;

/**
 * 4px base spacing unit. Keys are the multiplier (so `space[4]` = 4 × 4px).
 * `05` = the half-step (2px), named without a dot so it survives being
 * flattened into a CSS custom property name (`--p-space-05`) unchanged.
 */
export const space = {
  '05': '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

/**
 * Radius scale — deliberately restrained. Terminal panes don't have bubbly
 * corners; `sm` is the default everywhere, `md` exists only for floating
 * overlays, `full` only for true pills (status dots, avatars).
 */
export const radius = {
  none: '0px',
  sm: '2px',
  md: '4px',
  full: '9999px',
} as const;

/** Motion — short, purposeful, transform/opacity only, reduced-motion aware (enforced in global.css, not here). */
export const motion = {
  durationFast: '100ms',
  durationBase: '160ms',
  durationSlow: '220ms',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeIn: 'cubic-bezier(0.7, 0, 0.84, 0)',
} as const;
