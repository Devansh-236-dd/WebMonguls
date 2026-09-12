export const RANKS = [
  { minLevel: 1, name: 'NOOB' },
  { minLevel: 5, name: 'ROOKIE' },
  { minLevel: 10, name: 'ADVENTURER' },
  { minLevel: 20, name: 'PRO' },
  { minLevel: 35, name: 'MASTER' },
  { minLevel: 50, name: 'ELITE' }
] as const;

export function xpRequired(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('Level must be a positive integer');
  return Math.ceil(100 * level ** 1.5);
}

export function levelFromXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp < 0) throw new Error('XP must be a non-negative number');
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpRequired(level)) {
    remaining -= xpRequired(level);
    level += 1;
  }
  return level;
}

export function rankFromLevel(level: number): string {
  const rank = [...RANKS].reverse().find((candidate) => level >= candidate.minLevel);
  return rank?.name ?? 'NOOB';
}

export function diminishingMultiplier(completionsInCategoryToday: number): number {
  return [1, 0.6, 0.3, 0.1][Math.min(completionsInCategoryToday, 3)];
}

export function varietyMultiplier(attributeCount: number): number {
  return attributeCount >= 3 ? 1.1 : 1;
}

export function comebackMultiplier(momentum: number, lastActiveAt: Date | null, now = new Date()): number {
  if (!lastActiveAt || momentum > 0) return 1;
  const hoursAway = (now.getTime() - lastActiveAt.getTime()) / 3_600_000;
  return hoursAway >= 24 ? 1.1 : 1;
}
