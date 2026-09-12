import { PrismaClient, Attribute, EvidenceType } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const user = await db.user.upsert({ where: { id: 'demo-user' }, update: {}, create: { id: 'demo-user', displayName: 'Kenneth', xp: 2840, gold: 1250, level: 17, momentum: 12, lastActiveAt: new Date() } });
  for (const attribute of Object.values(Attribute)) await db.userAttribute.upsert({ where: { userId_attribute: { userId: user.id, attribute } }, update: {}, create: { userId: user.id, attribute, value: attribute === Attribute.INTELLECT ? 81 : attribute === Attribute.DISCIPLINE ? 73 : attribute === Attribute.STRATEGY ? 68 : attribute === Attribute.STRENGTH ? 62 : attribute === Attribute.ENDURANCE ? 54 : 41 } });
  const now = new Date();
  const studyStart = new Date(now); studyStart.setHours(9, 0, 0, 0);
  const studyEnd = new Date(now); studyEnd.setHours(12, 0, 0, 0);
  const night = new Date(now); night.setHours(23, 59, 59, 999);
  const quests = [
    { id: 'quest-water-2l', title: 'Drink Water', category: 'Hydration', attribute: Attribute.DISCIPLINE, xpReward: 45, goldReward: 12, evidenceType: EvidenceType.VIDEO, activeFrom: now, activeUntil: night },
    { id: 'quest-study-summary', title: 'Study Summary', category: 'Studying', attribute: Attribute.INTELLECT, xpReward: 100, goldReward: 35, evidenceType: EvidenceType.VIDEO, activeFrom: studyStart, activeUntil: studyEnd },
    { id: 'quest-run-3k', title: 'Run 3 KM', category: 'Running', attribute: Attribute.ENDURANCE, xpReward: 80, goldReward: 20, evidenceType: EvidenceType.CONNECTED_SOURCE, distanceMeters: 3000, durationSeconds: 900, activeFrom: now, activeUntil: night },
    { id: 'quest-read-20', title: 'Read 20 Pages', category: 'Reading', attribute: Attribute.INTELLECT, xpReward: 40, goldReward: 10, evidenceType: EvidenceType.VIDEO },
    { id: 'quest-blue-vale', title: 'Blue Vale Checkpoint', category: 'Exploration', attribute: Attribute.ENDURANCE, xpReward: 120, goldReward: 45, evidenceType: EvidenceType.LOCATION_VIDEO, checkpointLat: 51.5007, checkpointLng: -0.1246, checkpointRadiusM: 150 },
    { id: 'quest-code-60', title: 'Code for 60 min', category: 'Studying', attribute: Attribute.INTELLECT, xpReward: 100, goldReward: 35, evidenceType: EvidenceType.NONE }
  ];
  for (const quest of quests) await db.quest.upsert({ where: { id: quest.id }, update: quest, create: quest });
}

main().finally(() => db.$disconnect());
