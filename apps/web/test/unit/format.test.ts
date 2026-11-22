import { describe, expect, it } from 'vitest';
import { formatDuration, formatTokens } from '@/utils/format';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [999, '0s'],
    [59_000, '59s'],
    [60_000, '1:00'],
    [61_000, '1:01'],
    [3_599_000, '59:59'],
    [3_600_000, '1h00m'],
    [3_660_000, '1h01m'],
    [26 * 3_600_000 + 5 * 60_000, '26h05m'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1.0k'],
    [1234, '1.2k'],
    [1_500_000, '1500.0k'],
  ])('%i → %s', (n, expected) => {
    expect(formatTokens(n)).toBe(expected);
  });
});
