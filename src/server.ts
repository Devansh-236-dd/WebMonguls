import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import { verifyConnectedCompletion, verifyVideoCompletion } from './services/evidence-service.js';
import { exchangeStravaCode, getStravaActivity, stravaAuthorizeUrl } from './services/strava-service.js';
import { trackDistanceMeters, validateGpsTrack, TrackPoint } from './domain/gps.js';
import { awardQuestRewards } from './services/reward-service.js';
import { demoProfile, demoQuests, demoStart, demoVerifyGps, demoVerifyStrava, demoVerifyVideo, demoCreateQuest } from './services/demo-store.js';

const app = express();
const demoMode = !process.env.DATABASE_URL;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
app.use(express.json());
app.use(express.static('.'));

function userId(req: express.Request): string {
  const value = req.header('x-user-id');
  if (!value) throw new Error('x-user-id is required until Auth.js is connected');
  return value;
}

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'life-rpg-api' }));

app.get('/api/me', asyncRoute(async (req, res) => {
  if (demoMode) return res.json(demoProfile());
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: userId(req) }, include: { attributes: true, strava: { select: { athleteId: true } } } });
  res.json(profile);
}));

app.post('/api/quests/create', asyncRoute(async (req, res) => {
  const body = z.object({
    title: z.string().min(1),
    category: z.string().min(1),
    attribute: z.enum(['STRENGTH', 'ENDURANCE', 'INTELLECT', 'STRATEGY', 'DISCIPLINE', 'CREATIVITY']),
    xpReward: z.number().int().min(1).default(50),
    goldReward: z.number().int().min(0).default(15),
    evidenceType: z.enum(['NONE', 'VIDEO', 'LOCATION_VIDEO', 'CONNECTED_SOURCE']).default('VIDEO'),
    distanceMeters: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
  }).parse(req.body);
  if (demoMode) {
    const quest = demoCreateQuest(body);
    return res.status(201).json(quest);
  }
  const quest = await prisma.quest.create({ data: body });
  res.status(201).json(quest);
}));

app.get('/api/quests', asyncRoute(async (_req, res) => {
  if (demoMode) return res.json(demoQuests);
  const quests = await prisma.quest.findMany({ orderBy: { title: 'asc' } });
  res.json(quests);
}));

app.post('/api/quests/:questId/start', asyncRoute(async (req, res) => {
  const id = userId(req);
  if (demoMode) return res.status(201).json(demoStart(id, String(req.params.questId)));
  const quest = await prisma.quest.findUniqueOrThrow({ where: { id: String(req.params.questId) } });
  const now = new Date();
  if (quest.activeFrom && now < quest.activeFrom || quest.activeUntil && now > quest.activeUntil) return res.status(409).json({ error: 'Quest is outside its active window' });
  if (quest.checkpointLat !== null && quest.checkpointLng !== null && !quest.checkpointRadiusM) return res.status(500).json({ error: 'Quest checkpoint is misconfigured' });
  const completion = await prisma.questCompletion.create({ data: { userId: id, questId: quest.id, status: 'STARTED' } });
  res.status(201).json({ completionId: completion.id, evidenceType: quest.evidenceType });
}));

app.post('/api/completions/:completionId/video', upload.single('video'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video is required' });
  if (demoMode) {
    const latitude = req.body.latitude === undefined ? undefined : Number(req.body.latitude);
    const longitude = req.body.longitude === undefined ? undefined : Number(req.body.longitude);
    const result = await demoVerifyVideo({ userId: userId(req), completionId: String(req.params.completionId), buffer: req.file.buffer, mimetype: req.file.mimetype, durationMs: Number(req.body.durationMs ?? 0), subject: String(req.body.subject ?? ''), summary: String(req.body.summary ?? ''), location: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined, storageDir: process.env.EVIDENCE_STORAGE_DIR ?? './storage/evidence' });
    return res.json({ ok: true, status: 'VERIFIED', ...result, demoMode: true });
  }
  const latitude = req.body.latitude === undefined ? undefined : Number(req.body.latitude);
  const longitude = req.body.longitude === undefined ? undefined : Number(req.body.longitude);
  const location = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  await verifyVideoCompletion(prisma, { completionId: String(req.params.completionId), userId: userId(req), file: { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size }, capturedAt: new Date(), durationMs: Number(req.body.durationMs ?? 0), metadata: { subject: String(req.body.subject ?? ''), summary: String(req.body.summary ?? '') }, location, storageDir: process.env.EVIDENCE_STORAGE_DIR ?? './storage/evidence', categoriesCompletedToday: Number(req.body.categoriesCompletedToday ?? 0), attributesTrainedToday: Number(req.body.attributesTrainedToday ?? 0) });
  res.json({ ok: true, status: 'VERIFIED' });
}));

const connectedActivitySchema = z.object({ activityId: z.string(), categoriesCompletedToday: z.number().int().min(0).default(0), attributesTrainedToday: z.number().int().min(0).default(0) });
app.post('/api/completions/:completionId/strava', asyncRoute(async (req, res) => {
  const body = connectedActivitySchema.parse(req.body);
  if (demoMode && req.body.activity) {
    const activity = { ...req.body.activity, startDate: new Date(req.body.activity.startDate) };
    const result = demoVerifyStrava(userId(req), String(req.params.completionId), activity);
    return res.json({ ok: true, status: 'VERIFIED', ...result, demoMode: true });
  }
  const connection = await prisma.stravaConnection.findUniqueOrThrow({ where: { userId: userId(req) } });
  const activity = await getStravaActivity(connection.accessToken, body.activityId);
  await verifyConnectedCompletion(prisma, { completionId: String(req.params.completionId), userId: userId(req), activity, categoriesCompletedToday: body.categoriesCompletedToday, attributesTrainedToday: body.attributesTrainedToday });
  res.json({ ok: true, status: 'VERIFIED', activity: { distanceMeters: activity.distanceMeters, movingTimeSeconds: activity.movingTimeSeconds, polyline: activity.polyline } });
}));

app.post('/api/completions/:completionId/gps', asyncRoute(async (req, res) => {
  const id = userId(req);
  const points = z.array(z.object({ latitude: z.number(), longitude: z.number(), timestamp: z.string().datetime() })).min(2).parse(req.body.points) as TrackPoint[];
  if (demoMode) return res.json({ ok: true, status: 'VERIFIED', ...demoVerifyGps(id, String(req.params.completionId), points), demoMode: true });
  const completion = await prisma.questCompletion.findUniqueOrThrow({ where: { id: String(req.params.completionId) }, include: { quest: true } });
  if (completion.userId !== id || completion.quest.evidenceType !== 'CONNECTED_SOURCE' || !completion.quest.activeFrom || !completion.quest.activeUntil) throw new Error('GPS completion is not valid for this quest');
  validateGpsTrack(points, completion.quest.distanceMeters ?? 0, completion.quest.durationSeconds ?? 0, completion.quest.activeFrom, completion.quest.activeUntil);
  const sourceActivityId = `device-gps:${completion.id}`;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.questCompletion.updateMany({ where: { id: completion.id, userId: id, status: 'STARTED' }, data: { status: 'VERIFIED' } });
    if (updated.count !== 1) throw new Error('Completion is already finalized');
    await tx.evidence.create({ data: { completionId: completion.id, userId: id, type: 'CONNECTED_SOURCE', capturedAt: new Date(), source: 'device-gps', sourceActivityId, metadata: { points, distanceMeters: trackDistanceMeters(points) } } });
  });
  await awardQuestRewards(prisma, { userId: id, completionId: completion.id, baseXp: completion.quest.xpReward, baseGold: completion.quest.goldReward, attribute: completion.quest.attribute, categoriesCompletedToday: 0, attributesTrainedToday: 0 });
  res.json({ ok: true, status: 'VERIFIED', distanceMeters: trackDistanceMeters(points) });
}));

app.get('/api/integrations/strava/connect', asyncRoute(async (req, res) => {
  const state = `${userId(req)}:${Date.now()}`;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  if (!clientId || !redirectUri) return res.status(503).json({ error: 'Strava integration is not configured' });
  res.json({ authorizeUrl: stravaAuthorizeUrl(state, { clientId, redirectUri }) });
}));

app.get('/api/integrations/strava/callback', asyncRoute(async (req, res) => {
  const code = z.string().parse(req.query.code);
  const state = z.string().parse(req.query.state);
  const callbackUserId = state.split(':')[0];
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(503).send('Strava integration is not configured');
  const token = await exchangeStravaCode(code, { clientId, clientSecret });
  await prisma.stravaConnection.upsert({ where: { userId: callbackUserId }, create: { userId: callbackUserId, ...token }, update: token });
  res.send('Strava connected. You can close this window.');
}));

const purchaseSchema = z.object({ itemKey: z.string().min(1), priceGold: z.number().int().positive() });
app.post('/api/store/purchases', asyncRoute(async (req, res) => {
  const id = userId(req);
  const { itemKey, priceGold } = purchaseSchema.parse(req.body);
  const purchase = await prisma.$transaction(async (tx) => {
    const existing = await tx.storePurchase.findUnique({ where: { userId_itemKey: { userId: id, itemKey } } });
    if (existing) throw new Error('Item already owned');
    const updated = await tx.user.updateMany({ where: { id, gold: { gte: priceGold } }, data: { gold: { decrement: priceGold } } });
    if (updated.count !== 1) throw new Error('Not enough gold');
    return tx.storePurchase.create({ data: { userId: id, itemKey, priceGold } });
  });
  res.status(201).json(purchase);
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Request failed';
  res.status(400).json({ error: message });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Life RPG API running at http://localhost:${port}`));
