# Service Scheduler API

## Requirements

- Node.js 22 or newer
- npm
- Docker Compose

## Local development

Run these commands from `be/`:

```sh
cp .env.example .env
npm install
docker compose up -d postgres
npm run start:dev
```

The API listens on `http://localhost:3000`. Swagger UI is at `/api/docs`. URI versioning uses `/api` as the global prefix and defaults unversioned controllers to v1; this MVP currently implements v1 only. The public health and readiness endpoints are `/api/v1/health` and `/api/v1/ready`; readiness returns `503` when PostgreSQL is unavailable.

The PostgreSQL service uses local-development credentials only. Do not reuse them outside local development. The Drizzle connection and configuration are in place; domain tables and migrations are added in the schema implementation step.

## Checks

```sh
npm run lint
npm run build
npm test
```