import { describe, expect, it } from 'vitest';
import { assertVideoEvidence, distanceMeters, isInsideCheckpoint, matchConnectedActivity } from './evidence.js';

describe('evidence rules', () => {
  it('checks GPS distance against a checkpoint radius', () => {
    const park = { latitude: 51.5007, longitude: -0.1246 };
    expect(isInsideCheckpoint(park, park, 50)).toBe(true);
    expect(distanceMeters(park, { latitude: 51.51, longitude: -0.1246 })).toBeGreaterThan(500);
  });
  it('requires hashed video proof', () => {
    expect(() => assertVideoEvidence({ mimetype: 'image/jpeg', size: 20, sha256: 'x' })).toThrow();
    expect(() => assertVideoEvidence({ mimetype: 'video/webm', size: 20 })).toThrow();
    expect(() => assertVideoEvidence({ mimetype: 'video/webm', size: 20, sha256: 'x' })).not.toThrow();
  });
  it('rejects old or undersized connected activities', () => {
    expect(() => matchConnectedActivity({ id: '1', type: 'Run', distanceMeters: 3_000, movingTimeSeconds: 1_800, startDate: new Date('2026-09-12T10:00:00Z') }, { activeFrom: new Date('2026-09-12T09:00:00Z'), activeUntil: new Date('2026-09-12T11:00:00Z'), distanceMeters: 3_000, durationSeconds: 1_000 })).not.toThrow();
    expect(() => matchConnectedActivity({ id: '1', type: 'Run', distanceMeters: 3_000, movingTimeSeconds: 1_800, startDate: new Date('2026-09-11T10:00:00Z') }, { activeFrom: new Date('2026-09-12T09:00:00Z'), activeUntil: new Date('2026-09-12T11:00:00Z') })).toThrow();
  });
});
