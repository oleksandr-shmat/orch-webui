/**
 * ORCH Web UI — custom PrimeVue v4 preset.
 *
 * Built with `definePreset` on top of Aura (PrimeVue's own recommended
 * starting point for a fully custom theme — see PrimeVue v4 theming docs).
 * Aura is used only as a structural base (it defines every token PrimeVue
 * components read); every color, radius and focus token below is
 * overridden with ORCH's own values from `tokens.ts`. Nothing here should
 * read as a stock preset.
 *
 * v1 is dark-only by product decision (this is an operator dashboard, not a
 * marketing site) — see DESIGN.md "Decisions". Light `colorScheme` is left
 * as an unstyled/undesigned fallback (PrimeVue's own zinc surface) purely so
 * the app doesn't break if `.orch-dark` is ever removed; it is not a
 * designed second theme.
 *
 * Component-level token overrides here are limited to the handful of keys
 * confirmed against PrimeVue v4's documented preset shape (button, card,
 * formField). Deeper per-component tokens (DataTable row density, Tag/Badge
 * severity backgrounds, etc.) are intentionally NOT guessed here — once
 * apps/web is scaffolded and PrimeVue is actually installed, verify exact
 * token keys via browser devtools (`--p-<component>-*` custom properties)
 * before adding more `components.*` entries. Until then, render status
 * color/glyph via `status.ts` directly (see DESIGN.md "Status").
 */
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { ember, signal, ink, radius, font, text, lineHeight, space, motion, status } from './tokens';

export const OrchPreset = definePreset(Aura, {
  // Custom token groups PrimeVue doesn't ship by default. PrimeVue's token
  // engine auto-generates a `--p-<group>-<key>` CSS custom property for
  // every entry here (camelCase keys become kebab-case, e.g.
  // `motion.durationFast` -> `--p-motion-duration-fast`), so the whole
  // design system in tokens.ts becomes available as plain CSS vars — no
  // hand-written, drift-prone duplicate values in global.css.
  extend: {
    radius: { ...radius },
    font: { ...font },
    text: { ...text },
    lineHeight: { ...lineHeight },
    space: { ...space },
    motion: { ...motion },
    status: { ...status },
  },

  primitive: {
    ink,
    ember,
    signal,
  },

  semantic: {
    // Primary accent = ember (warm amber), not PrimeVue's default emerald/indigo.
    primary: {
      50: '{ember.50}',
      100: '{ember.100}',
      200: '{ember.200}',
      300: '{ember.300}',
      400: '{ember.400}',
      500: '{ember.500}',
      600: '{ember.600}',
      700: '{ember.700}',
      800: '{ember.800}',
      900: '{ember.900}',
      950: '{ember.950}',
    },

    // Focus ring uses the cool accent (signal/cyan) so focus is never
    // confused with the warm primary/status colors — a distinct third hue.
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{signal.400}',
      offset: '2px',
    },

    colorScheme: {
      dark: {
        surface: {
          0: '{ink.0}',
          50: '{ink.50}',
          100: '{ink.100}',
          200: '{ink.200}',
          300: '{ink.300}',
          400: '{ink.400}',
          500: '{ink.500}',
          600: '{ink.600}',
          700: '{ink.700}',
          800: '{ink.800}',
          900: '{ink.900}',
          950: '{ink.950}',
        },
        formField: {
          hoverBorderColor: '{primary.color}',
          focusBorderColor: '{signal.400}',
        },
      },
      // Undesigned fallback — see file header. Do not extend this without a
      // deliberate decision to ship a real light mode.
      light: {
        surface: {
          0: '#ffffff',
          50: '{zinc.50}',
          100: '{zinc.100}',
          200: '{zinc.200}',
          300: '{zinc.300}',
          400: '{zinc.400}',
          500: '{zinc.500}',
          600: '{zinc.600}',
          700: '{zinc.700}',
          800: '{zinc.800}',
          900: '{zinc.900}',
          950: '{zinc.950}',
        },
      },
    },
  },

  components: {
    button: {
      root: {
        borderRadius: '{radius.sm}',
      },
    },
    card: {
      colorScheme: {
        dark: {
          root: {
            background: '{ink.800}',
            color: '{ink.0}',
          },
          subtitle: {
            color: '{ink.300}',
          },
        },
      },
    },
  },
});

/** Options passed alongside the preset to PrimeVue's `theme` config in main.ts. */
export const orchThemeOptions = {
  preset: OrchPreset,
  options: {
    prefix: 'p',
    // Permanent — see file header. Apply this class to <html>
    // once, in index.html or main.ts, and never render a light-mode toggle
    // without a design decision to build one.
    darkModeSelector: '.orch-dark',
    cssLayer: {
      name: 'primevue',
      order: 'theme, base, primevue',
    },
  },
};
