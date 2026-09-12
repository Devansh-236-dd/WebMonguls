import { describe, expect, it } from 'vitest';
import { diminishingMultiplier, levelFromXp, rankFromLevel, varietyMultiplier, xpRequired } from './progression.js';

describe('server progression rules', () => {
  it('uses the PRD non-linear XP curve', () => {
    expect(xpRequired(1)).toBe(100);
    expect(xpRequired(4)).toBe(800);
  });
  it('advances levels only from accumulated server XP', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(382)).toBe(2);
    expect(levelFromXp(383)).toBe(3);
  });
  it('maps level bands to ranks', () => {
    expect(rankFromLevel(1)).toBe('NOOB');
    expect(rankFromLevel(20)).toBe('PRO');
    expect(rankFromLevel(50)).toBe('ELITE');
  });
  it('applies anti-farming and variety rules', () => {
    expect(diminishingMultiplier(0)).toBe(1);
    expect(diminishingMultiplier(1)).toBe(0.6);
    expect(diminishingMultiplier(4)).toBe(0.1);
    expect(varietyMultiplier(2)).toBe(1);
    expect(varietyMultiplier(3)).toBe(1.1);
  });
});
