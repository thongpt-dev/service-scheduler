# Service Scheduler API

This document is the API contract reference for the backend MVP. The product scope and booking rules are summarized in [plan.md](plan.md); database entities and constraints are detailed in [data-model.md](data-model.md).

## Conventions

- **Protocol:** REST over HTTPS in deployed environments, with JSON request/response bodies.
- **Versioning:** NestJS URI versioning uses `/api` as the global prefix. MVP application routes use `/api/v1`. Do not add v2 until an approved breaking contract must coexist with supported v1 clients.
- **Swagger:** UI is served at `/api/docs`. Every endpoint should document its tag, operation summary/description, applicable request example, authentication requirement, and success/error responses. Swagger tags identify the feature and v1.
- **Validation:** Nest's global validation pipe transforms DTOs, rejects unknown fields, and validates all request-boundary DTO constraints.
- **Authentication:** Protected requests use `Authorization: Bearer <access-token>` with a NestJS-issued JWT. Email verification is not required during the MVP.

## Implemented authentication endpoints

| Method and path | Authentication | Purpose | Success |
| --- | --- | --- | --- |
| `POST /api/v1/auth/customers/register` | Public | Create an unverified customer account and issue an access token. Links an active, unlinked customer profile with the same normalized email when present; otherwise creates a profile. A conflicting user email returns `409`. | `201` |
| `POST /api/v1/auth/customers/login` | Public | Authenticate a customer by email/password. An unverified customer may sign in. | `200` |
| `POST /api/v1/auth/staff/login` | Public | Authenticate an active user with at least one active dealership membership. | `200` |
| `POST /api/v1/auth/staff/provision` | Bearer JWT; owner or manager membership in the target dealership | Create a new unverified account and dealership membership. Managers can create `staff`; owners can assign any dealership membership role. Existing accounts are not re-passworded or linked through this operation. | `201` |
| `POST /api/v1/auth/tokens/revoke-all` | Bearer JWT | Increment the caller's `token_version`, invalidating previously issued tokens. | `200` |
| `GET /api/v1/health` | Public | Process liveness check. | `200` |
| `GET /api/v1/ready` | Public | Database readiness check. | `200`, `503` |

## Implemented domain endpoints

| Method and path | Authentication | Purpose | Success |
| --- | --- | --- | --- |
| `GET /api/v1/customers/me` | Customer JWT | Read the caller's linked customer profile. | `200` |
| `PATCH /api/v1/customers/me` | Customer JWT | Update the caller's name and phone. Email changes are not supported through this route. | `200` |
| `GET /api/v1/customers/me/dealerships` | Customer JWT | List active dealerships associated with the caller's customer profile. | `200` |
| `PUT /api/v1/customers/me/dealerships/{dealershipId}` | Customer JWT | Opt in to associate the caller's customer profile with an active dealership; safe to repeat. The customer ID is derived from the authenticated token. | `200` |
| `GET /api/v1/customers/me/vehicles` | Customer JWT | List active vehicles owned by or explicitly shared with the caller, including every dealership assignment for each vehicle. Assignments are many-to-many; an empty list means the vehicle is not assigned to a dealership. | `200` |
| `PUT /api/v1/customers/me/vehicles/{vehicleId}/dealerships/{dealershipId}` | Vehicle-owner customer JWT | Assign an owned vehicle to an active dealership. The customer ID is derived from the token; customer/dealership association and vehicle assignment are created atomically. | `200` |
| `GET /api/v1/dealerships` | Customer or staff JWT | List active dealerships. | `200` |
| `GET /api/v1/dealerships/{dealershipId}` | Customer or staff JWT | Read an active dealership. | `200` |
| `POST /api/v1/dealerships` | Customer or staff JWT | Create a dealership and assign the caller its first owner membership atomically. | `201` |
| `PATCH /api/v1/dealerships/{dealershipId}` | Owner JWT for that dealership | Update dealership details, timezone, or active state. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/memberships` | Owner or manager membership in that dealership | List membership user IDs, roles, and active state. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/customers` | Any staff membership in that dealership | List active customer profiles associated with that dealership. | `200` |
| `POST /api/v1/dealerships/{dealershipId}/customers` | Any staff membership in that dealership | Create an unlinked customer profile and associate it with that dealership. Does not create login credentials or link an existing account by email. | `201` |
| `GET /api/v1/dealerships/{dealershipId}/customers/{customerId}` | Any staff membership in that dealership | Read an associated customer profile. | `200` |
| `PATCH /api/v1/dealerships/{dealershipId}/customers/{customerId}` | Any staff membership in that dealership | Update an associated customer's name or phone. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/customers/{customerId}/vehicles` | Any staff membership in that dealership | List vehicles explicitly assigned to the dealership and owned by or shared with this associated customer. Customer association alone does not expose vehicles. | `200` |
| `POST /api/v1/dealerships/{dealershipId}/customers/{customerId}/vehicles` | Any staff membership in that dealership | Staff-assisted intake: create a vehicle owned by the associated customer and assign it to this dealership atomically. | `201` |
| `PATCH /api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}` | Any staff membership in that dealership | Update or deactivate a vehicle explicitly assigned to that dealership. | `200` |
| `POST /api/v1/dealerships/{dealershipId}/customers/{customerId}/vehicle-access` | Any staff membership in that dealership | Grant an associated customer access to an assigned dealership vehicle owned by another customer. | `201` |
| `DELETE /api/v1/dealerships/{dealershipId}/customers/{customerId}/vehicle-access/{vehicleId}` | Any staff membership in that dealership | Revoke additional customer access to an assigned dealership vehicle; ownership cannot be revoked through this route. | `200` |
| `GET /api/v1/service-types` | Customer or staff JWT | List active shared service-type definitions. | `200` |
| `POST /api/v1/service-types` | Manager or owner membership in any dealership | Add a shared service-type definition. Its availability at a dealership is controlled by a dealership offering. | `201` |
| `PATCH /api/v1/service-types/{serviceTypeId}` | Manager or owner membership in any dealership | Update or deactivate a shared service-type definition. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/services` | Customer or staff JWT | List active service offerings for a dealership. | `200` |
| `POST /api/v1/dealerships/{dealershipId}/services` | Owner or manager in that dealership | Add an active shared service type to the dealership with its configured duration. | `201` |
| `PATCH /api/v1/dealerships/{dealershipId}/services/{dealershipServiceId}` | Owner or manager in that dealership | Change the dealership-specific duration or deactivate the offering. | `200` |
| `GET /api/v1/availability?dealershipId={id}&vehicleId={id}&serviceTypeId={id}&date={YYYY-MM-DD}` | Customer JWT for self; dealership staff JWT with `customerId` for assisted lookup | Return advisory candidate starts using the dealership-local date, explicit vehicle assignment, active service duration, hours/closures, technician qualification/shift/leave, bay capability, and confirmed appointments. Does not reserve a slot. | `200` |

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

## Appointment endpoints

| Method and path | Authentication | Purpose | Success |
| --- | --- | --- | --- |
| `POST /api/v1/appointments/self-service` | Customer JWT | Confirm an appointment for the customer in the token. | `201` |
| `POST /api/v1/appointments/staff-assisted` | Owner, manager, or staff membership in the target dealership | Confirm an appointment for the specified associated customer. | `201` |
| `GET /api/v1/appointments/me?period={period}` | Customer JWT | List the caller's upcoming or past appointments (`period` is `upcoming` or `past`); supports `status`, `limit` (1-100), and `offset`. Defaults to upcoming, limit 50, offset 0. | `200` |
| `GET /api/v1/appointments/me/{appointmentId}` | Customer JWT | Read an appointment belonging to the caller. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/appointments?from={timestamp}&to={timestamp}` | Owner, manager, or staff membership in that dealership | Search appointment starts in the half-open `[from, to)` interval; optional `status` and `customerId` filters, plus `limit`/`offset` pagination. | `200` |
| `GET /api/v1/dealerships/{dealershipId}/appointments/{appointmentId}` | Owner, manager, or staff membership in that dealership | Read an appointment in the dealership schedule. | `200` |
| `POST /api/v1/appointments/{appointmentId}/cancel` | Customer who owns the appointment or any member of its dealership | Cancel a confirmed appointment that has not started. | `200` |
| `POST /api/v1/appointments/{appointmentId}/reschedule` | Customer who owns the appointment or any member of its dealership | Revalidate and atomically move a confirmed appointment to a new start. | `200` |
| `PATCH /api/v1/appointments/{appointmentId}/status` | Owner, manager, or staff membership in that dealership | Mark a confirmed appointment `completed` or `no_show`. | `200` |

Both endpoints require an `Idempotency-Key` header (1-255 characters). Keys are scoped to the authenticated actor and appointment-create operation and retained for 24 hours. A retry with the same normalized request returns the original appointment; reusing the key for a different request returns `409 IDEMPOTENCY_KEY_REUSED`. Capacity conflicts return `409 SLOT_UNAVAILABLE`.

The creation JSON body contains `dealershipId`, `vehicleId`, `serviceTypeId`, and a zoned `startsAt`; staff-assisted requests also contain `customerId`. Self-service customer identity comes from the JWT. The server validates explicit dealership vehicle assignment and customer ownership/shared access, derives duration from the active dealership offering, checks hours/closures and resource eligibility, and allocates both resources within one transaction. Client-provided end times, duration, technician, and bay are not accepted.

Rescheduling accepts `{ "startsAt": "2026-10-21T16:00:00.000Z" }`. It retains the original service and duration snapshots, validates the same customer/vehicle/dealership relationship, rechecks the schedule and reassigns resources in one transaction. The appointment ID and history remain; an audit event records the old/new schedule and resource IDs. A failed reschedule leaves the current appointment unchanged. Cancellation and status changes also append lifecycle audit events containing only allowlisted identifiers, action, status, schedule, and resource fields; no customer contact or vehicle data is copied into audit records.

Customers can cancel or reschedule their own confirmed appointments until the scheduled start; no additional notice cutoff applies. Any active dealership member may cancel or reschedule appointments in that dealership. Only dealership members may set `completed` or `no_show`, and only from `confirmed`: `no_show` requires the appointment to have started, while `completed` requires its scheduled end to have passed. Cancelled, completed, and no-show appointments remain in history and release capacity.

## Authentication and authorization contract

- Customer signup and staff provisioning validate email and password at the DTO boundary. Passwords must be 12–128 characters and are stored only as salted scrypt hashes.
- Emails are trimmed/lowercased before lookup and storage. Login failures use a generic invalid-credentials response to avoid disclosing whether an account exists.
- New customer and staff accounts have nullable `email_verified_at` set to `null`. No verification-code endpoint, email delivery, or verified-email gate is part of the MVP.
- Customer registration rejects an email already used by a user account. If an active customer profile exists with that email but has no linked user, registration links the new account to that profile and preserves its existing profile fields; otherwise registration creates a new profile. Since email verification is not implemented, the profile link is based on the email entered during registration and does not prove control of that email address.
- JWTs are signed with HS256 using `JWT_SECRET` (at least 32 bytes) and validate signature, expiry, issuer, and audience. The configured default access-token lifetime is 1800 seconds (allowed range: 60–3600 seconds).
- JWT role/membership claims are not treated as authoritative. Each protected request checks the user is active, compares JWT token version with `users.token_version`, and loads current active customer/dealership memberships from PostgreSQL.
- `POST /api/v1/auth/staff/provision` requires an active owner or manager membership for the requested dealership. Managers may provision only `staff`; only owners may assign `owner` or `manager` roles.
- The caller who creates a dealership is assigned its initial dealership-scoped owner membership in the same transaction. This is not a global system-administrator role.
- `POST /api/v1/auth/tokens/revoke-all` increments `token_version`; requests using tokens with the prior version are rejected.

## Error conventions

Error responses use a stable JSON envelope: `statusCode`, `code`, `message`, and `timestamp`. Standard NestJS errors use status-derived codes such as `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, and `SERVICE_UNAVAILABLE`; domain conflicts preserve codes such as `SLOT_UNAVAILABLE`, `IDEMPOTENCY_KEY_REUSED`, and `APPOINTMENT_NOT_READY_FOR_STATUS`. Unexpected server errors return `INTERNAL_SERVER_ERROR` with a generic message; implementation details are not included.

| Status | Use |
| --- | --- |
| `400` | Malformed or DTO-invalid input, including unknown fields. |
| `401` | Missing/invalid/expired/revoked JWT or invalid credentials. |
| `403` | Authenticated caller lacks required role or dealership membership. |
| `404` | Resource does not exist or is outside the caller's allowed visibility; avoid confirming protected record existence. |
| `409` | Duplicate account conflict, unavailable booking slot, idempotency-key reuse with a different normalized request, or invalid appointment lifecycle transition. |
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
