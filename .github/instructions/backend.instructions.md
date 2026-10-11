---
name: Backend Implementation Guidance
description: "Use when implementing or reviewing NestJS backend code, authentication, API endpoints, database schema or migrations, appointment scheduling, or backend tests in be/."
applyTo: "be/**"
---

# Backend Implementation Guidance

## Product and architecture source of truth

- Follow [docs/mvp.md](../../docs/mvp.md) for MVP scope, [docs/plan.md](../../docs/plan.md) for roles, data, booking rules, and API behavior, and [docs/system-design.md](../../docs/system-design.md) for architecture and security boundaries.
- Treat these documents as a single contract. If implementation work exposes a conflict or missing decision, explain it and update the relevant design document as part of the requested work; do not silently invent incompatible behavior.
- Keep this scope backend-only. The React customer/staff portals, email verification, external identity-provider integration, reminders, production cloud deployment, and advanced telemetry are deferred unless explicitly brought into scope.

## Backend design and API quality

- Keep HTTP concerns in NestJS controllers and business rules in injectable application/domain services. Use DTO validation at API boundaries and reject unexpected fields.
- Use NestJS URI versioning with `/api` as the global prefix. The MVP implements routes under `/api/v1` only; keep its HTTP controllers and DTOs under `src/http/v1/` and set controller version `"1"` explicitly. Do not create `src/http/v2/`, v2 controllers/DTOs, or v2 Swagger grouping as future-proof boilerplate. Add v2 only when an approved breaking API-contract change needs to coexist with supported v1 routes; then keep v1 behavior unchanged, add version-specific transport types/controllers, and share application/domain services.
- Keep Swagger UI at `/api/docs`; document the currently implemented version. If v2 is introduced, make the specification distinguish both versions. For every added or changed endpoint, update Swagger tags, `@ApiOperation` descriptions, applicable request examples, authentication requirements, and relevant success/error responses.
- Use consistent errors: `400`/`422` for invalid input, `401`/`403` for authentication or authorization failures, and `409` for booking conflicts or idempotency-key reuse with a different request. Avoid leaking whether inaccessible customer or vehicle records exist.
- Enforce customer ownership and dealership membership/role scope in the API on every protected operation. Never trust a client-supplied entity ID or a frontend guard as authorization.
- Reuse existing NestJS, Drizzle, validation, logging, and test patterns. Keep TypeScript types explicit, avoid unsafe casts and `any`, and keep changes focused and reviewable.

## Authentication and privacy

- MVP accounts use email/password sign-up and sign-in. Hash passwords with a suitable password-hashing algorithm; never store or log plaintext credentials.
- New accounts are unverified (`emailVerifiedAt` is null). Do not add email-verification flows or block MVP sign-in/booking based on this flag unless the scope is explicitly changed.
- Issue signed JWT access tokens from the NestJS API and validate signature, expiry, issuer, and audience. Load signing secrets from environment-specific configuration; never commit secrets or log credentials/tokens.
- External identity-provider support is optional and deferred. Do not mix provider tokens with NestJS-issued JWTs; if explicitly implemented later, use a separately configured issuer/audience and JWKS or token-introspection validation path.
- Logs and audit data must be allowlisted and PII-conscious. Do not log raw request bodies, email addresses, phone numbers, VINs, passwords, tokens, verification codes, or secrets. Review audit snapshots for personal data before persisting them.

## Scheduling and data integrity

- The server is authoritative for availability, service duration, and technician/bay assignment. Do not accept client-selected resources or client-calculated appointment end times as authoritative.
- Apply the MVP policy: 2-hour minimum notice, 60-day booking horizon, 15-minute start increments in dealership-local time, fixed duration from the active dealership-service offering, and zero setup/cleanup buffers.
- Availability must evaluate the complete service interval against dealership hours/closures, technician qualification/shift/leave, bay capability, and existing `confirmed` appointments. Availability is advisory and must not create a hold.
- On confirmation, revalidate and allocate both resources in one short database transaction. Only `confirmed` appointments reserve technician and bay capacity; cancellation, completion, and no-show release it. Keep application checks and PostgreSQL exclusion constraints consistent.
- Require idempotency keys for booking creation. Scope records by authenticated actor and operation; store the normalized request hash and resulting appointment for 24 hours. Replay a matching request and return `409` when a key is reused with a different request.
- Store appointment instants as timezone-aware UTC timestamps and interpret recurring schedules with the dealership's IANA timezone. Use half-open `[start, end)` intervals so adjacent bookings do not overlap.
- Preserve appointment records and booked service snapshots. Prefer deactivation over deleting records referenced by appointment history. Keep Drizzle schema, SQL migrations, and the data model in `docs/plan.md` aligned; update documentation in the same change when schema or validation rules change.

## Tests and required validation

- Add focused tests with each behavior change. Cover authorization boundaries, invalid relationships, validation failures, state transitions, and relevant boundary conditions; do not rely on happy-path tests alone.
- Use unit tests for isolated rules and service behavior. Use API/database integration tests with PostgreSQL for migrations, constraints, transactional booking, idempotency, and lifecycle behavior. Test simultaneous overlapping requests to prove at most one booking succeeds.
- Include timezone/DST, half-open interval boundaries, minimum notice/horizon, technician qualification/shift/leave, bay capability, cancellation, and failed-reschedule cases where those behaviors are touched.
- Before completing backend code changes, run from `be/`:
  - `npm run lint`
  - `npm run build`
  - `npm test`
  - Run PostgreSQL-backed integration tests and `npm run test:cov` when the change touches persistence, booking, authorization boundaries, or shared behavior.
- Fix introduced TypeScript, lint, and test failures. Do not weaken or remove tests merely to make a change pass. Report checks that could not run and why.
