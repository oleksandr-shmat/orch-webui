/**
 * Status → { glyph, color, label } maps for the three status enums exposed
 * by `@oxgeneral/orch` (confirmed from `dist/index.d.ts`, not guessed):
 *
 *   TaskStatus  = 'todo' | 'in_progress' | 'retrying' | 'review' | 'done' | 'failed' | 'cancelled'
 *   AgentStatus = 'idle' | 'running' | 'error' | 'disabled'
 *   RunStatus   = 'preparing' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled'
 *
 * This is the single source of truth for how status renders anywhere in the
 * app (Kanban cards, agent roster, run history, activity feed). Never encode
 * status with color alone — every entry pairs a glyph with a color so it
 * reads correctly for color-blind users and in the dense feed view where
 * color may be muted.
 *
 * Glyphs are shared across a small closed set on purpose (mirrors the Ink
 * TUI's own status characters) — don't invent a new glyph per status, reuse
 * these five:
 *   ○ not started yet    ● actively running    ↻ retrying
 *   ✓ finished OK         ✗ finished badly       ⊘ stopped, no outcome
 *   ◎ needs a human
 */
import { status as color } from './tokens';

export interface StatusVisual {
  glyph: string;
  color: string;
  label: string;
}

export const taskStatus: Record<
  'todo' | 'in_progress' | 'retrying' | 'review' | 'done' | 'failed' | 'cancelled',
  StatusVisual
> = {
  todo: { glyph: '○', color: color.idle, label: 'To do' },
  in_progress: { glyph: '●', color: color.info, label: 'In progress' },
  retrying: { glyph: '↻', color: color.warning, label: 'Retrying' },
  review: { glyph: '◎', color: color.warning, label: 'In review' },
  done: { glyph: '✓', color: color.success, label: 'Done' },
  failed: { glyph: '✗', color: color.danger, label: 'Failed' },
  cancelled: { glyph: '⊘', color: color.idle, label: 'Cancelled' },
};

export const agentStatus: Record<'idle' | 'running' | 'error' | 'disabled', StatusVisual> = {
  idle: { glyph: '○', color: color.idle, label: 'Idle' },
  running: { glyph: '●', color: color.info, label: 'Running' },
  error: { glyph: '✗', color: color.danger, label: 'Error' },
  disabled: { glyph: '⊘', color: color.idle, label: 'Disabled' },
};

export const runStatus: Record<
  'preparing' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled',
  StatusVisual
> = {
  preparing: { glyph: '○', color: color.idle, label: 'Preparing' },
  running: { glyph: '●', color: color.info, label: 'Running' },
  succeeded: { glyph: '✓', color: color.success, label: 'Succeeded' },
  failed: { glyph: '✗', color: color.danger, label: 'Failed' },
  timed_out: { glyph: '✗', color: color.danger, label: 'Timed out' },
  cancelled: { glyph: '⊘', color: color.idle, label: 'Cancelled' },
};
