import { Attribute, PrismaClient } from '@prisma/client';
import { comebackMultiplier, diminishingMultiplier, levelFromXp, varietyMultiplier } from '../domain/progression.js';

export async function awardQuestRewards(db: PrismaClient, input: { userId: string; completionId: string; baseXp: number; baseGold: number; attribute: Attribute; categoriesCompletedToday: number; attributesTrainedToday: number }): Promise<void> {
  await db.$transaction(async (tx) => {
    const completion = await tx.questCompletion.findUniqueOrThrow({ where: { id: input.completionId }, include: { user: true } });
    if (completion.userId !== input.userId || completion.status !== 'VERIFIED') throw new Error('Only verified completions can receive rewards');
    if (completion.awardedXp > 0 || completion.awardedGold > 0) throw new Error('Rewards have already been awarded');
    const multiplier = diminishingMultiplier(input.categoriesCompletedToday) * varietyMultiplier(input.attributesTrainedToday) * comebackMultiplier(completion.user.momentum, completion.user.lastActiveAt);
    const awardedXp = Math.floor(input.baseXp * multiplier);
    const awardedGold = input.baseGold;
    const nextXp = completion.user.xp + awardedXp;
    await tx.questCompletion.update({ where: { id: completion.id }, data: { awardedXp, awardedGold, completedAt: new Date() } });
    await tx.user.update({ where: { id: input.userId }, data: { xp: nextXp, gold: { increment: awardedGold }, level: levelFromXp(nextXp), lastActiveAt: new Date(), momentum: { increment: 1 } } });
    await tx.userAttribute.upsert({ where: { userId_attribute: { userId: input.userId, attribute: input.attribute } }, create: { userId: input.userId, attribute: input.attribute, value: 1 }, update: { value: { increment: 1 } } });
  });
}
