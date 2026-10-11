# Plan

## Actors and permissions

- **Customer:** signs up and signs in with email/password, selects dealerships to associate their profile with, books using a vehicle they own or can access, and views or manages their own appointments. New accounts are tagged unverified; verification is not required for MVP sign-in or booking.
- **Staff:** accesses only their dealership's data and can book for its customers, including customers without verified email.
- **Manager:** has staff permissions and can manage dealership services, hours, closures, technicians, qualifications, shifts, leave, bays, and bay capabilities. Resource configuration is dealership-scoped; it does not grant access to customer vehicles unless each vehicle is explicitly assigned to the dealership.
- **Owner:** has manager permissions and can manage dealership details and staff roles.
- An authenticated customer or staff account may create a dealership; the API assigns that caller the dealership's initial `owner` membership atomically with dealership creation. This is the MVP onboarding path; no global system-admin role is included.

The API enforces every permission. Resource IDs supplied by a client do not grant access.

## Data model

The backend stores:

- **Identity and access:** users, password hashes, customer profiles, nullable `emailVerifiedAt` (null means unverified), dealership memberships, and roles. Access JWTs are short-lived; rotating opaque refresh sessions are stored by token hash and issued in HttpOnly cookies. New accounts are unverified by default; the MVP does not provide verification flows or use this flag to block sign-in or booking.
- **Customers and vehicles:** customer details, vehicle ownership, and explicit access for additional customers.
- **Dealership customers and vehicles:** customers initiate dealership association. That association scopes the customer profile only and does not expose vehicles. Vehicle access is granted separately per dealership: the owner can assign a vehicle, or staff can assign one during intake. Dealership staff can access only explicitly assigned vehicles, and customer sharing still controls which associated customer may use each vehicle.
- **Dealership configuration:** dealership details and timezone, a shared service-type catalog and dealership-specific offerings/durations, operating hours and closures, technicians and qualifications/shifts/leave, and bays and service capabilities.
- **Appointments:** customer, vehicle, dealership, service, assigned technician and bay, start/end, status, booking channel, creator, reference, and snapshots of the booked service and duration.
- **Idempotency records:** authenticated actor, operation, idempotency key, normalized request hash, resulting appointment, creation time, and expiry. Enforce uniqueness on actor + operation + key. Keep records for 24 hours; a retry with the same key and request returns the original result, while reusing the key for a different request returns `409`.

Use foreign keys, checks, unique constraints, and indexes to protect relationships and support queries. Deactivate records referenced by appointment history instead of deleting them. Store appointment times as timezone-aware UTC instants; use dealership-local time for schedules and display. Use half-open intervals `[start, end)` so a booking may start when another ends.

## Booking rules

1. A customer can book only a vehicle they own or have explicit access to. A dealership may service a vehicle only when it is explicitly assigned to that dealership. Staff bookings must verify both dealership assignment and that the selected customer can use the vehicle.
2. The dealership and service must be active, and the dealership must offer the service. The server determines duration from that offering.
3. The requested start must be at least 2 hours in the future and no more than 60 days ahead. Generate candidate starts in 15-minute increments using the dealership's local schedule and timezone.
4. Use the active dealership-service offering's fixed duration. Vehicle-specific duration and preparation/cleanup buffers are not part of the MVP; use zero buffers.
5. For the entire service interval, at least one qualified technician must be on shift and not on leave, and at least one active compatible bay must be free.
6. Availability results are advisory and do not reserve a slot. On confirmation, the server rechecks availability and chooses the technician and bay. Clients cannot choose those assignments.
7. In one database transaction, validate the booking, allocate both resources, and create the appointment. PostgreSQL exclusion constraints prevent overlapping confirmed appointments for either resource. Return `409 SLOT_UNAVAILABLE` if a concurrent booking wins the slot.
8. Require an idempotency key for booking creation. Store the key and request hash per actor and operation for 24 hours. Matching retries return the original appointment; key reuse with a different request returns `409`.
9. Customers may cancel or reschedule their own confirmed appointments until the scheduled start; no additional notice cutoff applies. Any active dealership member may cancel or reschedule appointments in that dealership. Rescheduling updates the existing appointment only after the new interval and resources are secured atomically; otherwise, leave the current appointment unchanged and preserve the old/new schedule in an audit event.
10. MVP statuses are `confirmed`, `cancelled`, `completed`, and `no_show`. Only `confirmed` appointments reserve resources. Customers may only cancel their own appointments; dealership members may cancel/reschedule within their dealership and may mark confirmed appointments completed after their scheduled end or no-show after their scheduled start.

## Backend capability overview

The backend provides native customer/staff authentication, dealership-scoped customer and vehicle management, dealership onboarding with the creator assigned as owner, shared catalog and dealership-specific service configuration, dealership hours/closures, technician qualifications/shifts/leave, bays and capabilities, advisory availability search, atomic self-service/staff-assisted appointment creation with 24-hour idempotency, scoped appointment history and schedule search, and transactional appointment cancellation, rescheduling, and status changes. The API is versioned under `/api/v1`; implemented endpoint, request/authentication, and response/error contracts are maintained separately in [api.md](api.md). Detailed entities, relationships, and persistence constraints are maintained in [data-model.md](data-model.md).
