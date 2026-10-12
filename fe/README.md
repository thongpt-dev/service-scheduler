# Service Lane Demo

Mobile-width React + Vite client for the NestJS service scheduler API. The same single-column, phone-width interface is used on desktop.

## Run

From this directory:

```sh
npm install
npm run dev
```

The Vite development server proxies `/api/*` to `http://localhost:3000`. Start the backend separately and make sure its v1 API is available at `/api/v1`. Copy `.env.example` to `.env.local` only if you need to change `VITE_API_BASE_URL`.

Production validation:

```sh
npm run lint
npm run build
```

## Demo flows

- Customer registration/login, profile and dealership association, owned/shared vehicles, dealership assignment, service availability, booking, appointment history, cancellation, and rescheduling.
- Dealership login, daily schedule and filters, staff-assisted booking, customer/vehicle intake, cancellation, rescheduling, and status updates.
- Owner/manager setup for dealership details, staff provisioning, weekly hours, closures, service catalog/offering durations, technicians, qualifications, shifts/leave, bays, and service capabilities.

The API remains the source of truth for authorization, eligibility, and booking. Availability is advisory; the client submits only the selected time and domain IDs, and the backend chooses resources. Access tokens refresh automatically using a rotating HttpOnly cookie; sign-out revokes all sessions for the account.
