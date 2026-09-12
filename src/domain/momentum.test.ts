import { describe, expect, it } from 'vitest';
import { decayMomentum, milestoneReward } from './momentum.js';

describe('momentum rules', () => {
  it('decays gracefully after a missed day', () => {
    expect(decayMomentum(12, 0)).toBe(12);
    expect(decayMomentum(12, 1)).toBe(10);
    expect(decayMomentum(1, 1)).toBe(0);
  });
  it('returns milestone rewards without inventing rewards between milestones', () => {
    expect(milestoneReward(14)).toEqual({ gold: 150, title: 'Solar Crest' });
    expect(milestoneReward(13)).toBeNull();
  });
});
