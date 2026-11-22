import { describe, expect, it } from 'vitest';
import { agentStatus, runStatus, taskStatus } from '@/theme/status';

describe('status visuals', () => {
  it.each([
    ['taskStatus', taskStatus],
    ['agentStatus', agentStatus],
    ['runStatus', runStatus],
  ])('%s maps every status to a label and color', (_name, map) => {
    expect(Object.keys(map).length).toBeGreaterThan(0);
    for (const visual of Object.values(map)) {
      expect(visual.label).toBeTruthy();
      expect(visual.color).toMatch(/^(#|var\(|rgb|hsl)/);
    }
  });
});
