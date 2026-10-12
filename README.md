# Service Scheduler

A dealership service-scheduling MVP with a NestJS/PostgreSQL backend and a small React/Vite demo client. The API is the source of truth for authorization, availability, resource allocation, and appointment history.

## Implementation Overview

The backend in [`be/`](be/) provides:

- Customer and dealership staff email/password authentication, dealership-scoped roles, short-lived JWT access tokens, and rotating HttpOnly refresh-cookie sessions.
- Customer, vehicle, dealership, service catalog, offering, technician, service-bay, hours, closure, qualification, shift, and leave management.
- Advisory availability based on the complete service interval, dealership-local schedules, vehicle/dealership assignment, technician eligibility, compatible bays, and confirmed appointments.
- Customer self-service and staff-assisted booking with server-selected resources, transactional conflict protection, and 24-hour idempotency.
- Scoped appointment history and dealership schedule search, cancellation, rescheduling, completion/no-show actions, and PII-minimized lifecycle audit events.
- Health/readiness endpoints and allowlisted request logging.

The demo client in [`fe/`](fe/) exposes customer and dealership workspaces, booking, appointment management, customer/vehicle intake, and dealership configuration. It intentionally uses the same narrow mobile layout on desktop.

## Project Guides

- [MVP scope](docs/mvp.md)
- [Product roles and booking rules](docs/plan.md)
- [System design and security boundaries](docs/system-design.md)
- [API routes, payloads, and authorization](docs/api.md)
- [Database entities and constraints](docs/data-model.md)
- [Backend setup, seed accounts, and operations](be/README.md)
- [Frontend demo setup](fe/README.md)

## Run Locally

Requirements: Node.js 22+, npm, and Docker Compose.

Start the backend and PostgreSQL from `be/`:

```sh
cd be
cp .env.example .env
# Set JWT_SECRET to at least 32 random bytes in .env.
docker compose up -d postgres
npm install
npm run db:migrate
# Optional: set NODE_ENV=development in .env, then load local demo fixtures.
npm run db:seed
npm run start:dev
```

The API listens on `http://localhost:3000`; Swagger is at `http://localhost:3000/api/docs`.

In a second terminal, start the demo client from `fe/`:

```sh
cd fe
npm install
npm run dev
```

Vite serves the client at `http://localhost:5173` and proxies `/api/*` to the local backend. See the [backend README](be/README.md) and [frontend README](fe/README.md) for configuration details and local-only demo credentials.

## Build And Test

Backend checks, run from `be/`:

```sh
npm run lint
npm run build
npm test
```

PostgreSQL integration tests require a dedicated database named `service_scheduler_test`; `test:db` resets only that guarded test database:

```sh
docker compose exec postgres createdb -U postgres service_scheduler_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/service_scheduler_test npm run test:db
```

Frontend checks, run from `fe/`:

```sh
npm run lint
npm run build
```

## AI Collaboration Narrative

Github Copilot and I began by investigating the automotive service-scheduling domain and identifying the capabilities needed for a useful booking system. 
We then used [`docs/mvp.md`](docs/mvp.md) to narrow that into an MVP, [`docs/plan.md`](docs/plan.md) to make roles and booking rules explicit, and [`docs/system-design.md`](docs/system-design.md) to sketch the architecture and security boundaries before implementation.

From there, we worked through the implementation in reviewable steps, using the API and data-model documents as the contract. 
Copilot did most of the coding tasks inspected the existing code and nearby tests before proposing or making changes, then used builds, lint, unit tests, PostgreSQL integration tests, and HTTP/API-flow tests to verify behavior. 
I reviewed the changes, exercised the APIs and user flows, and gave feedback where behavior or documentation needed revision. We refined the implementation in response, including the the domain entities CRUDs, entity relations and API flows that will be used in the real scenario. This kept the AI-generated work grounded in the agreed MVP and checked against running code rather than treating generated output as complete by default.
The implementation process also followed the repository's [Copilot backend instructions](.github/instructions/backend.instructions.md), especially their guidance on feature boundaries, authorization, data integrity, and validation.
