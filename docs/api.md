# Service Scheduler API

This document is the API contract reference for the backend MVP. The product scope and booking rules are summarized in [plan.md](plan.md); database entities and constraints are detailed in [data-model.md](data-model.md).

## Conventions

- **Protocol:** REST over HTTPS in deployed environments, with JSON request/response bodies.
- **Versioning:** NestJS URI versioning uses `/api` as the global prefix. MVP application routes use `/api/v1`. Do not add v2 until an approved breaking contract must coexist with supported v1 clients.
- **Swagger:** UI is served at `/api/docs`. Every endpoint should document its tag, operation summary/description, applicable request example, authentication requirement, and success/error responses. Swagger tags identify the feature and v1.
- **Validation:** Nest's global validation pipe transforms DTOs, rejects unknown fields, and validates all request-boundary DTO constraints.
- **Authentication:** Protected requests use `Authorization: Bearer <access-token>` with a NestJS-issued JWT. Email verification is not required during the MVP.

## Implemented endpoints

| Method and path | Authentication | Purpose | Success |
| --- | --- | --- | --- |
| `POST /api/v1/auth/customers/register` | Public | Create an unverified customer user/profile and issue an access token. | `201` |
| `POST /api/v1/auth/customers/login` | Public | Authenticate a customer by email/password. An unverified customer may sign in. | `200` |
| `POST /api/v1/auth/staff/login` | Public | Authenticate an active user with at least one active dealership membership. | `200` |
| `POST /api/v1/auth/staff/provision` | Bearer JWT; owner or manager membership in the target dealership | Create a new unverified account and dealership membership. Managers can create `staff`; owners can assign any dealership membership role. Existing accounts are not re-passworded or linked through this operation. | `201` |
| `POST /api/v1/auth/tokens/revoke-all` | Bearer JWT | Increment the caller's `token_version`, invalidating previously issued tokens. | `200` |
| `GET /api/v1/health` | Public | Process liveness check. | `200` |
| `GET /api/v1/ready` | Public | Database readiness check. | `200`, `503` |

### Authentication request examples

Customer registration:

```json
{
  "email": "customer@example.test",
  "password": "A-long-customer-password-123",
  "firstName": "Jamie",
  "lastName": "Customer",
  "phone": "+12025550123"
}
```

Customer or staff login:

```json
{
  "email": "customer@example.test",
  "password": "A-long-customer-password-123"
}
```

Staff provisioning:

```json
{
  "dealershipId": "d3da5c9c-7be1-4cf8-91cf-f53ff4185c34",
  "email": "advisor@example.test",
  "password": "A-long-staff-password-123",
  "role": "staff"
}
```

These values are illustrative only. Never use real credentials in API examples.

## Planned MVP endpoint surface

The following business endpoints are in the MVP plan but are not yet implemented. Their detailed request/response DTOs, exact resource paths where not listed, and Swagger examples must be added alongside each controller in the feature implementation step; this inventory is not evidence that those endpoints already exist.

| Feature | Planned routes/capabilities | Access scope |
| --- | --- | --- |
| Customer profile | `GET/PATCH /api/v1/customers/me` | Signed-in customer; self only. |
| Customer vehicles | `GET /api/v1/customers/me/vehicles` | Signed-in customer; owned or explicitly authorized vehicles. |
| Staff customer/vehicle operations | Create/update customer and vehicle records; grant/revoke additional customer-to-vehicle access. | Authenticated staff scoped to their dealership, with manager/owner write permissions as defined by the operation. |
| Dealerships and services | List/read dealerships and offerings; configure dealership details, service offerings/durations, hours, and closures. | Public/authenticated read behavior to be finalized; writes are manager/owner and dealership-scoped. |
| Technicians and bays | Staff listings; manage technicians, qualifications, shifts, leave, bays, and service capabilities. | Reads scoped to staff dealership; manager/owner configuration. |
| Availability | `GET /api/v1/availability?dealershipId=&vehicleId=&serviceTypeId=&date=` | Authenticated and authorized for the vehicle/dealership. Returns candidate starts, service duration, and dealership timezone; does not hold a slot. |
| Appointments | Create self-service and staff-assisted bookings; list/read appointments; search a dealership schedule; cancel and reschedule. | Customers access their own authorized appointments; staff access only their dealership and permitted actions. |

## Booking request contract

When appointment creation is implemented, the client sends only:

- `dealershipId`
- `vehicleId`
- `serviceTypeId`
- requested `startsAt`
- required idempotency key (header or request location to be fixed in the booking endpoint specification)
- `customerId` only for staff-assisted booking

The server derives duration from the active dealership-service offering, calculates `endsAt`, validates access and availability, and assigns technician and bay. Client-provided end times or technician/bay assignments are not authoritative and must not be accepted as booking decisions.

Availability results are advisory. Confirmation rechecks the full interval inside the booking transaction. On cancellation capacity is released; rescheduling changes the existing booking only when the replacement interval and both resources are secured atomically.

## Authentication and authorization contract

- Customer signup and staff provisioning validate email and password at the DTO boundary. Passwords must be 12–128 characters and are stored only as salted scrypt hashes.
- Emails are trimmed/lowercased before lookup and storage. Login failures use a generic invalid-credentials response to avoid disclosing whether an account exists.
- New customer and staff accounts have nullable `email_verified_at` set to `null`. No verification-code endpoint, email delivery, or verified-email gate is part of the MVP.
- JWTs are signed with HS256 using `JWT_SECRET` (at least 32 bytes) and validate signature, expiry, issuer, and audience. The configured default access-token lifetime is 900 seconds (allowed range: 60–3600 seconds).
- JWT role/membership claims are not treated as authoritative. Each protected request checks the user is active, compares JWT token version with `users.token_version`, and loads current active customer/dealership memberships from PostgreSQL.
- `POST /api/v1/auth/staff/provision` requires an active owner or manager membership for the requested dealership. Managers may provision only `staff`; only owners may assign `owner` or `manager` roles.
- The initial dealership owner is optionally bootstrapped through seed-time environment values. It is a normal dealership-scoped owner membership, not a global system-administrator role.
- `POST /api/v1/auth/tokens/revoke-all` increments `token_version`; requests using tokens with the prior version are rejected.

## Error conventions

| Status | Use |
| --- | --- |
| `400` | Malformed or DTO-invalid input, including unknown fields. |
| `401` | Missing/invalid/expired/revoked JWT or invalid credentials. |
| `403` | Authenticated caller lacks required role or dealership membership. |
| `404` | Resource does not exist or is outside the caller's allowed visibility; avoid confirming protected record existence. |
| `409` | Duplicate account conflict, unavailable booking slot, or idempotency-key reuse with a different normalized request. |
| `503` | Readiness check cannot reach PostgreSQL. |

## Endpoint implementation layout

Keep each endpoint's HTTP adapter and DTOs with its owning module, for example:

```text
src/
  auth/
    auth.module.ts
    auth.service.ts
    http/v1/auth.controller.ts
    http/v1/dto/
  appointments/
    appointments.module.ts
    application/
    http/v1/appointments.controller.ts
    http/v1/dto/
```

Register controllers in their owning feature modules. Controllers handle HTTP, validation, and response mapping; application/domain services own reusable behavior. Add a feature-local `http/v2/` only for an approved breaking API contract that needs parallel support; keep v1 available and unchanged during migration.
