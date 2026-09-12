import { Coordinates, distanceMeters } from './evidence.js';

export type TrackPoint = Coordinates & { timestamp: string };

export function trackDistanceMeters(points: TrackPoint[]): number {
  return points.slice(1).reduce((total, point, index) => total + distanceMeters(points[index], point), 0);
}

export function validateGpsTrack(points: TrackPoint[], minimumDistanceM: number, minimumDurationSeconds: number, activeFrom: Date, activeUntil: Date): void {
  if (points.length < 2) throw new Error('At least two GPS points are required');
  const times = points.map((point) => new Date(point.timestamp).getTime());
  if (times.some((time) => !Number.isFinite(time) || time < activeFrom.getTime() || time > activeUntil.getTime())) throw new Error('GPS track contains points outside the quest window');
  if (times.at(-1)! <= times[0]) throw new Error('GPS track timestamps are invalid');
  if ((times.at(-1)! - times[0]) / 1000 < minimumDurationSeconds) throw new Error('GPS track is shorter than the quest duration');
  if (trackDistanceMeters(points) < minimumDistanceM) throw new Error('GPS track is shorter than the quest distance');
}
