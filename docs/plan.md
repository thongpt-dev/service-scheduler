# Plan

## Actors and permissions

- **Customer:** signs up and signs in with email/password, books using a vehicle they own or can access, and views or manages their own appointments. New accounts are tagged unverified; verification is not required for MVP sign-in or booking.
- **Staff:** accesses only their dealership's data and can book for its customers, including customers without verified email.
- **Manager:** has staff permissions and can manage dealership services, hours, closures, technicians, qualifications, shifts, leave, bays, and bay capabilities.
- **Owner:** has manager permissions and can manage dealership details and staff roles.

The API enforces every permission. Resource IDs supplied by a client do not grant access.

## Data model

The backend stores:

- **Identity and access:** users, password hashes, customer profiles, nullable `emailVerifiedAt` (null means unverified), dealership memberships, and roles. New accounts are unverified by default; the MVP does not provide verification flows or use this flag to block sign-in or booking.
- **Customers and vehicles:** customer details, vehicle ownership, and explicit access for additional customers.
- **Dealership configuration:** dealership details and timezone, services and durations, operating hours and closures, technicians and qualifications/shifts/leave, and bays and service capabilities.
- **Appointments:** customer, vehicle, dealership, service, assigned technician and bay, start/end, status, booking channel, creator, reference, and snapshots of the booked service and duration.
- **Idempotency records:** authenticated actor, operation, idempotency key, normalized request hash, resulting appointment, creation time, and expiry. Enforce uniqueness on actor + operation + key. Keep records for 24 hours; a retry with the same key and request returns the original result, while reusing the key for a different request returns `409`.

Use foreign keys, checks, unique constraints, and indexes to protect relationships and support queries. Deactivate records referenced by appointment history instead of deleting them. Store appointment times as timezone-aware UTC instants; use dealership-local time for schedules and display. Use half-open intervals `[start, end)` so a booking may start when another ends.

## Booking rules

1. A customer can book only a vehicle they own or have explicit access to. Staff bookings must verify that the selected customer can use the vehicle.
2. The dealership and service must be active, and the dealership must offer the service. The server determines duration from that offering.
3. The requested start must be at least 2 hours in the future and no more than 60 days ahead. Generate candidate starts in 15-minute increments using the dealership's local schedule and timezone.
4. Use the active dealership-service offering's fixed duration. Vehicle-specific duration and preparation/cleanup buffers are not part of the MVP; use zero buffers.
5. For the entire service interval, at least one qualified technician must be on shift and not on leave, and at least one active compatible bay must be free.
6. Availability results are advisory and do not reserve a slot. On confirmation, the server rechecks availability and chooses the technician and bay. Clients cannot choose those assignments.
7. In one database transaction, validate the booking, allocate both resources, and create the appointment. PostgreSQL exclusion constraints prevent overlapping confirmed appointments for either resource. Return `409 SLOT_UNAVAILABLE` if a concurrent booking wins the slot.
8. Require an idempotency key for booking creation. Store the key and request hash per actor and operation for 24 hours. Matching retries return the original appointment; key reuse with a different request returns `409`.
9. Keep appointment history when cancelling or rescheduling. Cancellation releases capacity. Rescheduling changes the booking only if the new interval and resources can be secured atomically; otherwise, leave the original booking unchanged.
10. MVP statuses are `confirmed`, `cancelled`, `completed`, and `no_show`. Only `confirmed` appointments reserve resources. Limit status changes by actor role.

## Backend modules and API surface

Use `/api/v1` for all application endpoints. The paths below define the intended capabilities; document request/response DTOs and common error cases in Swagger.

| Module                   | MVP endpoints and responsibilities                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                     | Customer email/password sign-up and sign-in with JWT; new accounts are tagged unverified and no verification flow is provided. Staff email/password sign-in, owner/manager provisioning, and token revocation. |
| Customers and vehicles   | `GET/PATCH /customers/me`; `GET /customers/me/vehicles`; staff create/update customers and vehicles; manage authorized vehicle access.                                                                   |
| Dealerships and services | List/read dealerships and offerings; manager/owner updates for dealership details, services, durations, hours, and closures.                                                                             |
| Technicians and bays     | Staff listing; manager/owner management of technicians, qualifications, shifts, leave, bays, and service capabilities.                                                                                   |
| Availability             | `GET /availability?dealershipId=&vehicleId=&serviceTypeId=&date=` returns available start times, duration, and dealership timezone without reserving a slot.                                             |
| Appointments             | Create self-service and staff-assisted bookings; list customer appointments; read appointment details; search dealership appointments by date/status/resource; cancel and reschedule with authorization. |
| System                   | Liveness/readiness checks and Swagger at `/api/docs`.                                                                                                                                                    |

For booking creation, the client sends the dealership, vehicle, service, requested start, and idempotency key. Staff-assisted requests also identify the customer. The server calculates the end time and assigns resources; do not accept client-provided technician or bay assignments. Customer email verification and external identity-provider integration are deferred.

Return `400`/`422` for invalid input, `401`/`403` for authentication or authorization failures, `404` where a missing or inaccessible resource should not be disclosed, and `409` for unavailable slots or idempotency conflicts.
