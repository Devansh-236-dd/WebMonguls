# Life RPG

This repository keeps the Stitch HTML screens as the visual reference and adds a TypeScript API foundation for the server-authoritative systems in the project brief.

## Backend setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Generate Prisma Client with `npm run db:generate`.
4. Apply the schema with `npm run db:migrate`.
5. Seed the demo profile and quests with `npm run db:seed`.
6. Run domain tests with `npm test`.
7. Start the API and static frontend with `npm run dev`.

The browser app is available at `http://localhost:3000/index.html`.

When `DATABASE_URL` is absent, the preview automatically uses a local in-memory demo store. Video files are still written to `storage/evidence`, while demo XP, Gold, completion, GPS, and Strava-shaped activity state live for the running server session. This makes the camera and GPS flows testable immediately. Configure PostgreSQL to use durable production persistence.

## Evidence API

Every request currently uses `x-user-id` as a temporary development identity until Auth.js is added.

- `POST /api/quests/:questId/start` creates a server-owned completion.
- `POST /api/completions/:completionId/video` accepts an in-app camera video upload. The server hashes it, rejects reuse, validates checkpoint GPS for `LOCATION_VIDEO`, stores the file, then awards rewards only after verification.
- `POST /api/completions/:completionId/strava` fetches the selected Strava activity server-side, checks its quest time window and thresholds, rejects reused activities, stores route metadata, then awards rewards.
- `POST /api/completions/:completionId/gps` validates a device GPS track server-side by timestamp, distance, and duration, then awards rewards.
- `GET /api/integrations/strava/connect` starts the OAuth flow.
- `GET /api/integrations/strava/callback` stores the token connection.
- `POST /api/store/purchases` deducts gold and grants the item in one database transaction.

The frontend now opens the camera/GPS evidence sheet from routine cards and calls these endpoints. A production map renderer and Auth.js identity can be layered on next. No client value is trusted for XP, Gold, level, attributes, evidence verification, or quest completion.
