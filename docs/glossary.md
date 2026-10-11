# Service Scheduler Glossary

Definitions for terms used in [mvp.md](mvp.md), [plan.md](plan.md), and [system-design.md](system-design.md). These definitions describe the backend MVP unless marked optional or future.

## Booking and availability

- **Availability:** Potential appointment start times for which the full service interval can be assigned both an eligible technician and compatible bay. Availability is advisory and does not reserve capacity.
- **Booking horizon:** How far ahead an appointment may start. The MVP allows bookings up to 60 days ahead.
- **Minimum lead time:** The minimum notice before an appointment may start. The MVP requires at least 2 hours.
- **Slot increment:** The spacing between potential start times returned by availability. The MVP offers starts in 15-minute increments using the dealership's local schedule; it does not define service duration.
- **Service duration:** The time a service occupies its assigned technician and bay. The MVP derives it from the active dealership-service offering, not from client input.
- **Preparation/cleanup buffer:** Extra time added before or after the service to reserve resources. The MVP uses zero buffer.
- **Service interval:** The complete resource-blocking period from appointment start to computed end, including any configured buffer. In the MVP it equals the configured service duration because buffers are zero.
- **Technician qualification:** A technician's authorization to perform a service, optionally subject to a validity period.
- **Technician shift and leave:** A shift is a technician's recurring working time; leave is a dated period when that technician is unavailable.
- **Bay capability:** The mapping that identifies which service types a service bay can support.
- **Dealership service offering:** An active service configured for a dealership, including its authoritative service duration.

## Accounts and access

- **Unverified account:** An account created with an email address that has not been verified. The MVP marks new accounts unverified but allows sign-in and booking; email verification and verified-email restrictions are deferred.
- **Customer vehicle access:** Authorization for a customer to book a vehicle, granted through ownership or an explicit access record.
- **Dealership membership:** A user's role and access scope at a dealership. Staff operations must be authorized against the relevant dealership membership.
- **Staff-assisted booking:** An authenticated dealership staff member creates an appointment for a customer. The API records the acting staff member and validates that the customer may use the selected vehicle.
- **Optional identity provider:** A separate external sign-in service that may be integrated later. It is not required for MVP email/password authentication or NestJS-issued JWTs.
- **JWT access token:** A signed JSON Web Token issued by the NestJS API after successful email/password sign-in. The client sends it in the `Authorization: Bearer` header; the API validates it and resolves the active user's current permissions.
- **JWKS:** A JSON Web Key Set published by an external identity provider. If that optional integration is added, the API can use its signing keys to validate provider-issued tokens.

## Appointments and capacity

- **Appointment:** The persistent booking record linking a customer, vehicle, dealership, service, assigned technician, assigned bay, time interval, status, booking channel, creator, reference, and snapshots of booked service details.
- **Appointment status:** The lifecycle state of a booking. MVP statuses are `confirmed`, `cancelled`, `completed`, and `no_show`; actor permissions govern transitions.
- **Capacity-reserving status:** A status that blocks a technician and bay for the appointment interval. In the MVP only `confirmed` reserves capacity; cancellation, completion, and no-show release it.
- **Appointment history:** Keep the appointment record instead of deleting it when it is cancelled or rescheduled, and retain snapshots of the booked service details. This term does not imply a separate event log unless one is explicitly implemented.
- **Rescheduling:** An operation that atomically secures a replacement interval and resources. If the replacement cannot be booked, the original appointment remains unchanged.
- **Resource allocation:** The server-side selection of one eligible technician and one compatible available bay. Clients do not choose or assert these assignments.
- **Idempotency key:** A client-provided key that identifies one booking-creation operation for safe retries. The API scopes it to the authenticated actor and operation, stores a request hash and result for 24 hours, replays the result for a matching retry, and returns `409` if the same key is reused with a different request.
- **Concurrency conflict:** A race in which another request reserves a required technician or bay first. The losing request creates no confirmed appointment and receives `409 SLOT_UNAVAILABLE`.

## Time and data integrity

- **Dealership timezone:** The dealership's IANA timezone, used to interpret opening hours, recurring shifts, closures, and local-time display.
- **UTC timestamp:** The timezone-aware instant stored for an appointment start or end. Convert it to the dealership timezone for display and schedule calculations.
- **Half-open interval `[start, end)`:** An interval that includes its start and excludes its end. Adjacent appointments may meet at the same instant without overlapping.
- **Database transaction:** A group of database operations committed or rolled back together. Booking uses a short transaction to revalidate eligibility, allocate resources, and create the appointment atomically.
- **Exclusion constraint:** A PostgreSQL constraint that rejects overlapping time ranges assigned to the same resource. The MVP applies it to confirmed appointments for both technicians and bays as the final concurrency safeguard.
- **Appointment snapshot:** A copy of important booked details, such as service name and duration, retained so later catalog edits do not rewrite appointment history.

## API and operations

- **Bearer authentication:** The API access pattern where a client sends an access token in `Authorization: Bearer <token>` on protected requests.
- **Swagger / OpenAPI:** The API description and interactive documentation used to inspect and test documented endpoints at `/api/docs`.
- **Liveness check:** Indicates that the API process is running.
- **Readiness check:** Indicates that the API can serve requests, including that required dependencies such as PostgreSQL are available.
- **PII:** Personally identifiable information, such as customer contact details. Logs and telemetry must avoid credentials, email addresses, VINs, request bodies, and other sensitive customer or vehicle data.
