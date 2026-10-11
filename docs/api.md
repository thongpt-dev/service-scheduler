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
| `GET /api/v1/customers/me/vehicles` | Customer JWT | List active vehicles owned by or explicitly shared with the caller. | `200` |
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
- Customer registration rejects an email already used by a user account. If an active customer profile exists with that email but has no linked user, registration links the new account to that profile and preserves its existing profile fields; otherwise registration creates a new profile. Since email verification is not implemented, the profile link is based on the email entered during registration and does not prove control of that email address.
- JWTs are signed with HS256 using `JWT_SECRET` (at least 32 bytes) and validate signature, expiry, issuer, and audience. The configured default access-token lifetime is 1800 seconds (allowed range: 60–3600 seconds).
- JWT role/membership claims are not treated as authoritative. Each protected request checks the user is active, compares JWT token version with `users.token_version`, and loads current active customer/dealership memberships from PostgreSQL.
- `POST /api/v1/auth/staff/provision` requires an active owner or manager membership for the requested dealership. Managers may provision only `staff`; only owners may assign `owner` or `manager` roles.
- The caller who creates a dealership is assigned its initial dealership-scoped owner membership in the same transaction. This is not a global system-administrator role.
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
