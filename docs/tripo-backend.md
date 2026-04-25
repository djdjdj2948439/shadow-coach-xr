# Tripo Backend

## Purpose

This backend module creates and polls Tripo3D text-to-model jobs for the XR hackathon demo. It is designed to keep `TRIPO_API_KEY` server-side, expose a small Next.js API surface for teammates, and provide a mock fallback when the real Tripo API should not be used.

Prompt presets live in `src/lib/tripo.ts` for the main asset categories:

- `ISS_MODULE`
- `ISS_TOOL_KIT`
- `ISS_CONTROL_PANEL`
- `ISS_STORAGE_BAG`
- `ASSISTANT_ROBOT`

## Local Environment Setup

Create or update `.env.local` with:

```bash
TRIPO_API_KEY=your_tripo_api_key_here
USE_MOCK_TRIPO=false
TRIPO_CACHE_TTL_SECONDS=3600
```

Do not commit `.env.local`.

`.env.example` intentionally keeps `TRIPO_API_KEY=` empty so the real key never enters Git history.

## API Endpoints

### `POST /api/tripo/generate`

Creates a Tripo text-to-model task.

Request body:

```json
{
  "prompt": "A realistic ISS module interior with control panels, floating tools and storage bags"
}
```

Example:

```bash
curl -X POST http://localhost:3000/api/tripo/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A realistic ISS module interior with control panels, floating tools and storage bags"}'
```

Response shape:

```json
{
  "ok": true,
  "mock": false,
  "taskId": "task_xxx",
  "status": "queued",
  "prompt": "A realistic ISS module interior with control panels, floating tools and storage bags",
  "message": "Tripo task created successfully.",
  "raw": {}
}
```

### `GET /api/tripo/task?taskId=...`

Polls a Tripo task. The route checks the in-memory cache first, then falls back to the remote Tripo API.

Example:

```bash
curl "http://localhost:3000/api/tripo/task?taskId=task_xxx"
```

Response shape:

```json
{
  "ok": true,
  "cached": false,
  "mock": false,
  "taskId": "task_xxx",
  "status": "running",
  "modelUrl": null,
  "raw": {}
}
```

### `GET /api/tripo/cache`

Returns the current in-memory cache entries for debugging.

Example:

```bash
curl "http://localhost:3000/api/tripo/cache"
```

## Mock Fallback

The backend returns mock task data instead of failing when either of these is true:

- `USE_MOCK_TRIPO=true`
- `TRIPO_API_KEY` is missing

This keeps the demo route stable during local development, CI, or preview deployments where a real Tripo key is unavailable.

## Cache Behavior

`src/lib/tripoCache.ts` uses a process-local `Map` with TTL support. This is meant only for the hackathon demo and does not persist across restarts or serverless cold starts.

## Vercel Environment Variables

Add these variables in the Vercel project settings:

- `TRIPO_API_KEY`
- `USE_MOCK_TRIPO`
- `TRIPO_CACHE_TTL_SECONDS`

For preview environments without a valid Tripo key, set `USE_MOCK_TRIPO=true`.
