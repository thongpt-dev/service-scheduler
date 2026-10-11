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

Before using auth endpoints, set `JWT_SECRET` in `.env` to at least 32 random bytes (for example, generate one with `openssl rand -base64 48`). Keep it private and use a different value per environment. Issuer and audience default to `service-scheduler-api` and `service-scheduler-clients`; access tokens last 1800 seconds by default (configurable from 60 to 3600 seconds). Passwords are stored as salted scrypt hashes; raw passwords and tokens are not logged.

The API listens on `http://localhost:3000`. Swagger UI is at `/api/docs`. URI versioning uses `/api` as the global prefix and defaults unversioned controllers to v1; this MVP currently implements v1 only. The public health and readiness endpoints are `/api/v1/health` and `/api/v1/ready`; readiness returns `503` when PostgreSQL is unavailable.

The auth endpoints are `/api/v1/auth/customers/register`, `/api/v1/auth/customers/login`, `/api/v1/auth/staff/login`, `/api/v1/auth/staff/provision`, and `/api/v1/auth/tokens/revoke-all`. Customer and provisioned staff accounts are unverified but can sign in; email verification is not implemented in the MVP. Only dealership owners and managers may provision within their own dealership; managers can provision staff accounts only. An authenticated customer or staff account can create a dealership and becomes its initial owner.

The domain APIs include customer profiles and dealership-customer association, dealership-scoped customer/vehicle management, dealership hours and closures, technician qualifications/shifts/leave, service bays and capabilities, shared service types, and dealership-specific service offerings. Vehicle access remains explicitly assigned per dealership. See [api.md](../docs/api.md) for implemented routes and access scopes.

The PostgreSQL service and demo accounts are for local development only. Never use the demo credentials outside a local development database. Migrations create the schema and booking-overlap constraints. The repeatable `npm run db:seed` command adds three fictional dealerships across different time zones, four service types, three customer profiles, five vehicles, four technicians, four service bays, qualifications, weekly schedules, future leave and closure intervals, dealership offerings, and explicit vehicle assignments. One customer-owned vehicle is intentionally left unassigned to demonstrate dealership privacy. The sample owner can manage all three dealerships, the sample manager and staff have scoped memberships, and the sample customer has a profile linked to a login account. Rerunning the seed preserves deterministic records and does not reset existing account passwords. Seeding requires `NODE_ENV=development` or `NODE_ENV=test`; it refuses to run when the mode is unset or any other value. If you already have a local `.env`, add `NODE_ENV=development` before seeding.

Local demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Customer | `sample.customer@example.test` | `LocalCustomerPass123!` |
| Owner | `sample.owner@example.test` | `LocalOwnerPass123!` |
| Manager | `sample.manager@example.test` | `LocalManagerPass123!` |
| Staff | `sample.staff@example.test` | `LocalStaffPass123!` |

Sign the customer in through `POST /api/v1/auth/customers/login`; sign the owner, manager, and staff in through `POST /api/v1/auth/staff/login`. These fixed credentials exist only to make the fictional local seed usable; do not deploy or seed them into a shared or production environment.

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

`test:db` runs schema/seed/capacity checks and auth service integration checks against the dedicated test database.