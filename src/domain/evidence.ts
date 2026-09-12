export type Coordinates = { latitude: number; longitude: number };
export type StravaActivity = { id: string; type: string; distanceMeters: number; movingTimeSeconds: number; startDate: Date; polyline?: string };

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lngDelta = toRadians(to.longitude - from.longitude);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideCheckpoint(userLocation: Coordinates, checkpoint: Coordinates, radiusM: number): boolean {
  if (radiusM <= 0) throw new Error('Checkpoint radius must be positive');
  return distanceMeters(userLocation, checkpoint) <= radiusM;
}

export function assertVideoEvidence(file: { mimetype: string; size: number; sha256?: string }): void {
  if (!file.mimetype.startsWith('video/')) throw new Error('Evidence must be a video file');
  if (file.size <= 0) throw new Error('Evidence file is empty');
  if (!file.sha256) throw new Error('Evidence hash is required');
}

export function matchConnectedActivity(activity: StravaActivity, quest: { activeFrom: Date; activeUntil: Date; distanceMeters?: number | null; durationSeconds?: number | null }): void {
  if (activity.startDate < quest.activeFrom || activity.startDate > quest.activeUntil) throw new Error('Connected activity is outside the quest window');
  if (quest.distanceMeters && activity.distanceMeters < quest.distanceMeters) throw new Error('Connected activity distance is below the quest threshold');
  if (quest.durationSeconds && activity.movingTimeSeconds < quest.durationSeconds) throw new Error('Connected activity duration is below the quest threshold');
}
