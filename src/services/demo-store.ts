import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isInsideCheckpoint, matchConnectedActivity, Coordinates } from '../domain/evidence.js';
import { trackDistanceMeters, TrackPoint, validateGpsTrack } from '../domain/gps.js';

type DemoQuest = {
  id: string;
  title: string;
  category: string;
  attribute: 'STRENGTH' | 'ENDURANCE' | 'INTELLECT' | 'STRATEGY' | 'DISCIPLINE' | 'CREATIVITY';
  xpReward: number;
  goldReward: number;
  evidenceType: 'NONE' | 'VIDEO' | 'LOCATION_VIDEO' | 'CONNECTED_SOURCE';
  distanceMeters?: number;
  durationSeconds?: number;
  checkpointLat?: number;
  checkpointLng?: number;
  checkpointRadiusM?: number;
  activeFrom?: Date;
  activeUntil?: Date;
};

type DemoCompletion = { id: string; userId: string; questId: string; status: 'STARTED' | 'VERIFIED'; };

const now = new Date();
const studyStart = new Date(now); studyStart.setHours(9, 0, 0, 0);
const studyEnd = new Date(now); studyEnd.setHours(12, 0, 0, 0);
const night = new Date(now); night.setHours(23, 59, 59, 999);

export const demoQuests: DemoQuest[] = [
  { id: 'quest-water-2l', title: 'Drink Water', category: 'Hydration', attribute: 'DISCIPLINE', xpReward: 45, goldReward: 12, evidenceType: 'VIDEO', activeFrom: now, activeUntil: night },
  { id: 'quest-study-summary', title: 'Study Summary', category: 'Studying', attribute: 'INTELLECT', xpReward: 100, goldReward: 35, evidenceType: 'VIDEO', activeFrom: studyStart, activeUntil: studyEnd },
  { id: 'quest-run-3k', title: 'Run 3 KM', category: 'Running', attribute: 'ENDURANCE', xpReward: 80, goldReward: 20, evidenceType: 'CONNECTED_SOURCE', distanceMeters: 3000, durationSeconds: 900, activeFrom: now, activeUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  { id: 'quest-blue-vale', title: 'Blue Vale Checkpoint', category: 'Exploration', attribute: 'ENDURANCE', xpReward: 120, goldReward: 45, evidenceType: 'LOCATION_VIDEO', checkpointLat: 51.5007, checkpointLng: -0.1246, checkpointRadiusM: 150 },
  { id: 'quest-read-20', title: 'Read 20 Pages', category: 'Reading', attribute: 'INTELLECT', xpReward: 40, goldReward: 10, evidenceType: 'VIDEO' }
];

const completions = new Map<string, DemoCompletion>();
const usedHashes = new Set<string>();
const awarded = new Set<string>();
let demoXp = 2840;
let demoGold = 1250;

export function demoStart(userId: string, questId: string): { completionId: string; evidenceType: DemoQuest['evidenceType'] } {
  const quest = demoQuests.find((item) => item.id === questId);
  if (!quest) throw new Error('Quest was not found');
  const current = new Date();
  if (quest.activeFrom && current < quest.activeFrom || quest.activeUntil && current > quest.activeUntil) throw new Error('Quest is outside its active window');
  const completionId = `demo-completion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  completions.set(completionId, { id: completionId, userId, questId, status: 'STARTED' });
  return { completionId, evidenceType: quest.evidenceType };
}

function getCompletion(userId: string, completionId: string): { completion: DemoCompletion; quest: DemoQuest } {
  const completion = completions.get(completionId);
  if (!completion || completion.userId !== userId) throw new Error('Completion was not found');
  const quest = demoQuests.find((item) => item.id === completion.questId);
  if (!quest) throw new Error('Quest was not found');
  if (completion.status !== 'STARTED') throw new Error('Completion is already finalized');
  return { completion, quest };
}

function award(completion: DemoCompletion, quest: DemoQuest): { xp: number; gold: number } {
  if (awarded.has(completion.id)) throw new Error('Rewards have already been awarded');
  const xp = quest.xpReward;
  const gold = quest.goldReward;
  awarded.add(completion.id);
  completion.status = 'VERIFIED';
  demoXp += xp;
  demoGold += gold;
  return { xp, gold };
}

export async function demoVerifyVideo(input: { userId: string; completionId: string; buffer: Buffer; mimetype: string; durationMs: number; location?: Coordinates; subject?: string; summary?: string; storageDir: string }): Promise<{ xp: number; gold: number; hash: string }> {
  const { completion, quest } = getCompletion(input.userId, input.completionId);
  if (quest.evidenceType !== 'VIDEO' && quest.evidenceType !== 'LOCATION_VIDEO') throw new Error('This quest does not accept video evidence');
  if (!input.mimetype.startsWith('video/')) throw new Error('Evidence must be a video file');
  if (input.buffer.length === 0) throw new Error('Evidence file is empty');
  if (input.durationMs < 5000) throw new Error('Video proof must be at least 5 seconds');
  if (quest.evidenceType === 'VIDEO' && quest.category === 'Studying' && (!input.subject?.trim() || !input.summary?.trim())) throw new Error('Study subject and summary are required');
  if (quest.evidenceType === 'LOCATION_VIDEO') {
    if (!input.location || quest.checkpointLat === undefined || quest.checkpointLng === undefined || !quest.checkpointRadiusM) throw new Error('Location evidence is incomplete');
    if (!isInsideCheckpoint(input.location, { latitude: quest.checkpointLat, longitude: quest.checkpointLng }, quest.checkpointRadiusM)) throw new Error('You are outside the quest checkpoint');
  }
  const hash = createHash('sha256').update(input.buffer).digest('hex');
  if (usedHashes.has(hash)) throw new Error('This evidence file has already been used');
  usedHashes.add(hash);
  await mkdir(input.storageDir, { recursive: true });
  await writeFile(path.join(input.storageDir, `${input.completionId}-${hash}.webm`), input.buffer);
  return { ...award(completion, quest), hash };
}

export function demoVerifyGps(userId: string, completionId: string, points: TrackPoint[]): { xp: number; gold: number; distanceMeters: number } {
  const { completion, quest } = getCompletion(userId, completionId);
  if (quest.evidenceType !== 'CONNECTED_SOURCE') throw new Error('This quest does not accept GPS evidence');
  validateGpsTrack(points, quest.distanceMeters ?? 0, quest.durationSeconds ?? 0, quest.activeFrom ?? new Date(0), quest.activeUntil ?? new Date(Date.now() + 1));
  return { ...award(completion, quest), distanceMeters: trackDistanceMeters(points) };
}

export function demoVerifyStrava(userId: string, completionId: string, activity: { id: string; type: string; distanceMeters: number; movingTimeSeconds: number; startDate: Date; polyline?: string }): { xp: number; gold: number; activity: typeof activity } {
  const { completion, quest } = getCompletion(userId, completionId);
  if (quest.evidenceType !== 'CONNECTED_SOURCE') throw new Error('This quest does not accept Strava evidence');
  matchConnectedActivity(activity, { activeFrom: quest.activeFrom ?? new Date(0), activeUntil: quest.activeUntil ?? new Date(Date.now() + 1), distanceMeters: quest.distanceMeters, durationSeconds: quest.durationSeconds });
  return { ...award(completion, quest), activity };
}

export function demoProfile() { return { id: 'demo-user', displayName: 'Kenneth', xp: demoXp, gold: demoGold, level: 17, momentum: 12, attributes: [], strava: null }; }
