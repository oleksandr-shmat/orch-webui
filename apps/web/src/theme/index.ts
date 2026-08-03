/**
 * Barrel export for the ORCH Web UI theme.
 *
 * Usage in main.ts:
 *
 *   import { PrimeVue } from 'primevue/config'   // or `import PrimeVue from 'primevue/config'` per installed version
 *   import { orchThemeOptions } from '@/theme'
 *   import '@/theme/global.css'
 *
 *   app.use(PrimeVue, { theme: orchThemeOptions })
 *
 * Also set `<html class="orch-dark">` once (index.html or a line in
 * main.ts) — see preset.ts and DESIGN.md "Decisions" for why this isn't a
 * runtime-toggleable light/dark switch in v1.
 */
export { OrchPreset, orchThemeOptions } from './preset';
export * as tokens from './tokens';
export { taskStatus, agentStatus, runStatus } from './status';
export type { StatusVisual } from './status';
