# MVP scopes

## Purpose and status

The overall product MVP replaces manual service booking with a server-authoritative workflow that finds a time when both a qualified technician and a compatible service bay can support the full service interval, then safely confirms the appointment. The Product scope below separates backend delivery from the customer and staff portals.

## Core requirements

1. Resource Constrained Booking: Allow a user to request a service appointment for a specific vehicle, service type, and dealership at a desired time.

2. Real-Time Availability Check: Before confirming, check for the availability of both a ServiceBay and a qualified Technician for the entire service duration.

3. Confirmed Appointment Record: Upon success, create a persistent Appointment record associating the customer, vehicle, technician, and service bay.

## Recommended MVP

- Customer booking: Sign up and sign in with email and password, choose an authorized vehicle, dealership, service, and available time; review duration and appointment details; confirm and receive a reference. New accounts are tagged unverified; verification is not required to sign in or book during the MVP.

- Reliable availability: Calculate availability from dealership hours and closures, service duration, technician qualifications and shifts, leave, bay capabilities, and existing confirmed appointments. Recheck everything when confirming; a displayed slot is not a reservation. MVP defaults: book 2 hours to 60 days ahead, offer starts in 15-minute increments, use the active dealership-service duration, and apply no preparation or cleanup buffer.

- Appointment management: View upcoming and past appointments, inspect details, cancel, and reschedule. Preserve history and only apply a reschedule if the new slot can be secured.

- Staff operations: Search and filter a dealership’s schedule, inspect appointments, and book for customers. The current API filters schedules by time range, status, and customer; technician and bay filters are not implemented. Managers configure hours, closures, services, technicians, shifts, leave, bays, and service compatibility.

- Trust and usability: Enforce customer and dealership access rules, show clear unavailable/error states, display times in the dealership’s timezone, and support responsive, keyboard-accessible forms.

- Operational reliability: Prevent overlapping bookings even when requests arrive simultaneously, make retries idempotent, retain appointment history, and monitor booking failures without putting personal or vehicle data in telemetry.

## Product scope

### In scope

- Backend email/password sign-up and sign-in with JWT access tokens; mark new accounts unverified, but do not require verification for sign-in or booking.
- Backend APIs for customer self-service and authenticated staff-assisted booking.
- Management of customers, vehicles, dealerships, services, technicians, bays, and dealership schedules, with dealership-scoped permissions.
- Availability search and server-side resource allocation based on the full service interval and the defaults above.
- Appointment confirmation, history, cancellation, and rescheduling with conflict-safe persistence.
- Backend validation, authorization, API documentation, database migrations, tests, health checks, and privacy-conscious operational logs.

### Out of scope for this backend MVP

- Customer and staff frontend portals; this plan covers the backend MVP.
- Email verification and external identity-provider integration; accounts remain tagged unverified in the MVP.
- The other later-release features listed above, plus production cloud deployment and advanced telemetry.

## Good candidates for later

- Email verification and verified-email authorization rules
- External identity-provider integration
- Automated appointment reminders and confirmations
- Waitlists for full time slots
- Payments or deposits
- Repair-order/workshop tracking
- CRM/DMS integration
- Multi-dealership staff administration
