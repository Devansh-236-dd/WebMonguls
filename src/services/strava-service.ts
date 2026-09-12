const STRAVA_AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';

export function stravaAuthorizeUrl(state: string, config: { clientId: string; redirectUri: string }): string {
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', approval_prompt: 'auto', scope: 'read,activity:read_all', state });
  return `${STRAVA_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeStravaCode(code: string, config: { clientId: string; clientSecret: string }): Promise<{ athleteId: string; accessToken: string; refreshToken: string; expiresAt: Date }> {
  const response = await fetch(STRAVA_TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: 'authorization_code' }) });
  if (!response.ok) throw new Error(`Strava token exchange failed: ${response.status}`);
  const data = await response.json() as { athlete: { id: number }; access_token: string; refresh_token: string; expires_at: number };
  return { athleteId: String(data.athlete.id), accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(data.expires_at * 1000) };
}

export async function getStravaActivity(accessToken: string, activityId: string): Promise<{ id: string; type: string; distanceMeters: number; movingTimeSeconds: number; startDate: Date; polyline?: string }> {
  const response = await fetch(`https://www.strava.com/api/v3/activities/${encodeURIComponent(activityId)}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Strava activity lookup failed: ${response.status}`);
  const data = await response.json() as { id: number; type: string; distance: number; moving_time: number; start_date: string; map?: { summary_polyline?: string } };
  return { id: String(data.id), type: data.type, distanceMeters: data.distance, movingTimeSeconds: data.moving_time, startDate: new Date(data.start_date), polyline: data.map?.summary_polyline };
}
