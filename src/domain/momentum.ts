export function decayMomentum(momentum: number, missedDays: number): number {
  if (!Number.isInteger(momentum) || momentum < 0 || !Number.isInteger(missedDays) || missedDays < 0) throw new Error('Momentum values must be non-negative integers');
  if (missedDays === 0) return momentum;
  return Math.max(0, momentum - Math.max(1, Math.ceil(momentum * 0.15) * missedDays));
}

export function milestoneReward(momentum: number): { gold: number; title?: string } | null {
  const rewards: Record<number, { gold: number; title?: string }> = { 3: { gold: 25 }, 7: { gold: 60 }, 14: { gold: 150, title: 'Solar Crest' }, 30: { gold: 350 }, 60: { gold: 800 }, 100: { gold: 1500, title: 'Century Flame' } };
  return rewards[momentum] ?? null;
}
