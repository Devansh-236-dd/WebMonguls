import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertVideoEvidence, isInsideCheckpoint, matchConnectedActivity, StravaActivity, Coordinates } from '../domain/evidence.js';
import { awardQuestRewards } from './reward-service.js';

const COMPLETION_STATUS = {
  STARTED: 'STARTED',
  EVIDENCE_PENDING: 'EVIDENCE_PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

const EVIDENCE_TYPE = {
  VIDEO: 'VIDEO',
  LOCATION_VIDEO: 'LOCATION_VIDEO',
  CONNECTED_SOURCE: 'CONNECTED_SOURCE',
} as const;

export type UploadedVideo = { buffer: Buffer; mimetype: string; size: number };

export async function verifyVideoCompletion(db: PrismaClient, input: { completionId: string; userId: string; file: UploadedVideo; capturedAt: Date; durationMs: number; metadata?: Record<string, string>; location?: Coordinates; storageDir: string; categoriesCompletedToday: number; attributesTrainedToday: number }): Promise<void> {
  const completion = await db.questCompletion.findUniqueOrThrow({ where: { id: input.completionId }, include: { quest: true } });
  if (completion.userId !== input.userId) throw new Error('Completion does not belong to this user');
  if (input.durationMs < 5000) throw new Error('Video proof must be at least 5 seconds');
  if (completion.quest.evidenceType !== EVIDENCE_TYPE.VIDEO && completion.quest.evidenceType !== EVIDENCE_TYPE.LOCATION_VIDEO) throw new Error('This quest does not accept video evidence');
  assertVideoEvidence({ ...input.file, sha256: createHash('sha256').update(input.file.buffer).digest('hex') });
  const sha256 = createHash('sha256').update(input.file.buffer).digest('hex');
  if (await db.evidence.findFirst({ where: { userId: input.userId, sha256 } })) throw new Error('This evidence file has already been used');
  if (completion.quest.evidenceType === EVIDENCE_TYPE.LOCATION_VIDEO) {
    if (!input.location || completion.quest.checkpointLat === null || completion.quest.checkpointLng === null || !completion.quest.checkpointRadiusM) throw new Error('Location evidence is incomplete');
    if (!isInsideCheckpoint(input.location, { latitude: completion.quest.checkpointLat, longitude: completion.quest.checkpointLng }, completion.quest.checkpointRadiusM)) throw new Error('You are outside the quest checkpoint');
  }
  await mkdir(input.storageDir, { recursive: true });
  const storageKey = path.join(input.storageDir, `${input.completionId}-${sha256}.webm`);
  await writeFile(storageKey, input.file.buffer);
  await db.$transaction(async (tx) => {
    const updated = await tx.questCompletion.updateMany({ where: { id: input.completionId, userId: input.userId, status: { in: [COMPLETION_STATUS.STARTED, COMPLETION_STATUS.EVIDENCE_PENDING] } }, data: { status: COMPLETION_STATUS.VERIFIED } });
    if (updated.count !== 1) throw new Error('Completion is already finalized');
    await tx.evidence.create({ data: { completionId: input.completionId, userId: input.userId, type: completion.quest.evidenceType, storageKey, sha256, capturedAt: input.capturedAt, durationMs: input.durationMs, latitude: input.location?.latitude, longitude: input.location?.longitude, source: 'camera', metadata: input.metadata } });
  });
  await awardQuestRewards(db, { userId: input.userId, completionId: input.completionId, baseXp: completion.quest.xpReward, baseGold: completion.quest.goldReward, attribute: completion.quest.attribute, categoriesCompletedToday: input.categoriesCompletedToday, attributesTrainedToday: input.attributesTrainedToday });
}

export async function verifyConnectedCompletion(db: PrismaClient, input: { completionId: string; userId: string; activity: StravaActivity; categoriesCompletedToday: number; attributesTrainedToday: number }): Promise<void> {
  const completion = await db.questCompletion.findUniqueOrThrow({ where: { id: input.completionId }, include: { quest: true } });
  if (completion.userId !== input.userId) throw new Error('Completion does not belong to this user');
  if (completion.quest.evidenceType !== EVIDENCE_TYPE.CONNECTED_SOURCE || !completion.quest.activeFrom || !completion.quest.activeUntil) throw new Error('This quest does not accept connected-source evidence');
  if (await db.evidence.findFirst({ where: { source: 'strava', sourceActivityId: String(input.activity.id) } })) throw new Error('This connected activity has already been used');
  matchConnectedActivity(input.activity, { activeFrom: completion.quest.activeFrom, activeUntil: completion.quest.activeUntil, distanceMeters: completion.quest.distanceMeters, durationSeconds: completion.quest.durationSeconds });
  await db.$transaction(async (tx) => {
    const updated = await tx.questCompletion.updateMany({ where: { id: input.completionId, userId: input.userId, status: COMPLETION_STATUS.STARTED }, data: { status: COMPLETION_STATUS.VERIFIED } });
    if (updated.count !== 1) throw new Error('Completion is already finalized');
    await tx.evidence.create({ data: { completionId: input.completionId, userId: input.userId, type: EVIDENCE_TYPE.CONNECTED_SOURCE, capturedAt: input.activity.startDate, source: 'strava', sourceActivityId: String(input.activity.id), metadata: { distanceMeters: input.activity.distanceMeters, movingTimeSeconds: input.activity.movingTimeSeconds, polyline: input.activity.polyline } } });
  });
  await awardQuestRewards(db, { userId: input.userId, completionId: input.completionId, baseXp: completion.quest.xpReward, baseGold: completion.quest.goldReward, attribute: completion.quest.attribute, categoriesCompletedToday: input.categoriesCompletedToday, attributesTrainedToday: input.attributesTrainedToday });
}
