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
npm run db:migrate
npm run db:seed
npm run start:dev
```

The API listens on `http://localhost:3000`. Swagger UI is at `/api/docs`. URI versioning uses `/api` as the global prefix and defaults unversioned controllers to v1; this MVP currently implements v1 only. The public health and readiness endpoints are `/api/v1/health` and `/api/v1/ready`; readiness returns `503` when PostgreSQL is unavailable.

The PostgreSQL service uses local-development credentials only. Do not reuse them outside local development. The schema migration creates MVP tables and PostgreSQL booking-overlap constraints. The repeatable seed command adds a fictional dealership, service, technician, bay, customer, and vehicle; it does not create login credentials.

## Checks

```sh
npm run lint
npm run build
npm test
```

PostgreSQL migration/seed checks require a dedicated test database. Create it once, then run the test; the test resets its schemas and refuses any database name other than `service_scheduler_test`:

```sh
docker compose exec postgres createdb -U postgres service_scheduler_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/service_scheduler_test npm run test:db
```