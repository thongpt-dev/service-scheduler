const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "service-scheduler.access-token";

export interface ApiErrorShape {
  message: string;
  status: number;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(error: ApiErrorShape) {
    super(error.message);
    this.name = "ApiError";
    this.status = error.status;
    this.code = error.code;
  }
}

export interface AuthResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  customerId?: string;
}

export interface Entity {
  id: string;
  [key: string]: unknown;
}

export interface Dealership extends Entity {
  name: string;
  timezone: string;
  city?: string;
  region?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  postalCode?: string;
  countryCode?: string;
  isActive?: boolean;
}

export interface DealershipInput {
  name?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface Vehicle extends Entity {
  vin: string;
  make: string;
  model: string;
  year: number;
  ownerCustomerId?: string;
  isActive?: boolean;
  dealershipAssignments?: Array<{
    dealershipId: string;
    dealershipName: string;
    dealershipCity: string;
    isDealershipActive: boolean;
  }>;
}

export interface Customer extends Entity {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  isActive?: boolean;
}

export interface ServiceType extends Entity {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface ServiceOffering extends Entity {
  dealershipId: string;
  serviceTypeId: string;
  durationMinutes: number;
  isActive: boolean;
  serviceName?: string;
}

export interface Appointment extends Entity {
  appointmentRef: string;
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceTypeId: string;
  assignedTechnicianId: string;
  assignedBayId: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  startsAt: string;
  endsAt: string;
  serviceNameSnapshot: string;
  durationMinutesSnapshot: number;
  bookingChannel?: "customer_self_service" | "staff_assisted";
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AvailabilityResult {
  dealershipId: string;
  vehicleId: string;
  serviceTypeId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    localStartTime: string;
    utcOffset: string;
  }>;
}

export interface WeeklyHours extends Entity {
  dealershipId: string;
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface ClosurePeriod extends Entity {
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface Technician extends Entity {
  displayName: string;
  employeeCode: string | null;
  isActive: boolean;
}

export interface Qualification extends Entity {
  technicianId: string;
  serviceTypeId: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface TechnicianShift extends Entity {
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  isActive: boolean;
}

export interface TechnicianLeave extends Entity {
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface ServiceBay extends Entity {
  bayCode: string;
  isActive: boolean;
}

export interface BayCapability extends Entity {
  serviceTypeId: string;
  serviceName?: string;
}

export interface Membership extends Entity {
  userId: string;
  role: "owner" | "manager" | "staff";
  isActive: boolean;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  retryAuth?: boolean;
}

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${API_BASE}/auth/tokens/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      let payload: unknown;
      if (raw) {
        try { payload = JSON.parse(raw) as unknown; }
        catch { payload = undefined; }
      }
      if (!response.ok || !isRecord(payload) || typeof payload.accessToken !== "string") {
        throw new ApiError({ status: response.status, message: "Session expired. Please sign in again." });
      }
      setAccessToken(payload.accessToken);
      return payload.accessToken;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retryAuth = true, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (fetchOptions.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: "include",
      headers,
      body: fetchOptions.body === undefined ? undefined : JSON.stringify(fetchOptions.body),
    });
  } catch {
    throw new ApiError({
      status: 0,
      message: "Could not reach the scheduler API. Check that the backend is running.",
    });
  }

  const isLoginOrRefresh = path.startsWith("/auth/customers/login") ||
    path.startsWith("/auth/customers/register") ||
    path.startsWith("/auth/staff/login") ||
    path.startsWith("/auth/tokens/refresh");
  if (response.status === 401 && token && retryAuth && !isLoginOrRefresh) {
    try {
      await refreshAccessToken();
      return request<T>(path, { ...options, retryAuth: false });
    } catch {
      setAccessToken(null);
      window.dispatchEvent(new Event("scheduler:session-expired"));
    }
  }

  const raw = await response.text();
  let payload: unknown;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    const payloadRecord = isRecord(payload) ? payload : undefined;
    const messageValue = payloadRecord?.message;
    const message = Array.isArray(messageValue)
      ? messageValue.filter((item): item is string => typeof item === "string").join(" ")
      : typeof messageValue === "string"
        ? messageValue
        : `Request failed (${response.status})`;
    const code = typeof payloadRecord?.code === "string" ? payloadRecord.code : undefined;
    if (response.status === 401 && !isLoginOrRefresh) {
      window.dispatchEvent(new Event("scheduler:session-expired"));
    }
    throw new ApiError({ status: response.status, message, code });
  }

  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

const json = (method: string, body?: unknown): RequestOptions => ({ method, body });
const id = (value: string) => encodeURIComponent(value);

export const api = {
  registerCustomer: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
    request<AuthResult>("/auth/customers/register", json("POST", body)),
  customerLogin: (body: { email: string; password: string }) =>
    request<AuthResult>("/auth/customers/login", json("POST", body)),
  staffLogin: (body: { email: string; password: string }) =>
    request<AuthResult>("/auth/staff/login", json("POST", body)),
  provisionStaff: (body: { dealershipId: string; email: string; password: string; role: string }) =>
    request<{ staffUserId: string }>("/auth/staff/provision", json("POST", body)),
  revokeTokens: () => request<{ revoked: true }>("/auth/tokens/revoke-all", json("POST")),

  getMyProfile: () => request<Customer>("/customers/me"),
  updateMyProfile: (body: { firstName?: string; lastName?: string; phone?: string | null }) =>
    request<Customer>("/customers/me", json("PATCH", body)),
  getMyDealerships: () => request<Dealership[]>("/customers/me/dealerships"),
  associateDealership: (dealershipId: string) =>
    request<Entity>(`/customers/me/dealerships/${id(dealershipId)}`, json("PUT")),
  getMyVehicles: () => request<Vehicle[]>("/customers/me/vehicles"),
  assignVehicle: (vehicleId: string, dealershipId: string) =>
    request<Entity>(`/customers/me/vehicles/${id(vehicleId)}/dealerships/${id(dealershipId)}`, json("PUT")),

  getDealerships: () => request<Dealership[]>("/dealerships"),
  getDealership: (dealershipId: string) => request<Dealership>(`/dealerships/${id(dealershipId)}`),
  createDealership: (body: DealershipInput) => request<Dealership>("/dealerships", json("POST", body)),
  updateDealership: (dealershipId: string, body: DealershipInput) =>
    request<Dealership>(`/dealerships/${id(dealershipId)}`, json("PATCH", body)),
  getMemberships: (dealershipId: string) => request<Membership[]>(`/dealerships/${id(dealershipId)}/memberships`),
  getDealershipCustomers: (dealershipId: string) => request<Customer[]>(`/dealerships/${id(dealershipId)}/customers`),
  createDealershipCustomer: (dealershipId: string, body: Partial<Customer>) =>
    request<Customer>(`/dealerships/${id(dealershipId)}/customers`, json("POST", body)),
  getDealershipCustomer: (dealershipId: string, customerId: string) =>
    request<Customer>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}`),
  updateDealershipCustomer: (dealershipId: string, customerId: string, body: Partial<Customer>) =>
    request<Customer>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}`, json("PATCH", body)),
  getCustomerVehicles: (dealershipId: string, customerId: string) =>
    request<Vehicle[]>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}/vehicles`),
  createCustomerVehicle: (dealershipId: string, customerId: string, body: Partial<Vehicle>) =>
    request<Vehicle>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}/vehicles`, json("POST", body)),
  updateDealershipVehicle: (dealershipId: string, vehicleId: string, body: Partial<Vehicle>) =>
    request<Vehicle>(`/dealerships/${id(dealershipId)}/vehicles/${id(vehicleId)}`, json("PATCH", body)),
  grantVehicleAccess: (dealershipId: string, customerId: string, vehicleId: string) =>
    request<{ granted: true }>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}/vehicle-access`, json("POST", { vehicleId })),
  revokeVehicleAccess: (dealershipId: string, customerId: string, vehicleId: string) =>
    request<{ revoked: true }>(`/dealerships/${id(dealershipId)}/customers/${id(customerId)}/vehicle-access/${id(vehicleId)}`, json("DELETE")),

  getServiceTypes: () => request<ServiceType[]>("/service-types"),
  createServiceType: (body: { name: string; description?: string }) => request<ServiceType>("/service-types", json("POST", body)),
  updateServiceType: (serviceTypeId: string, body: Partial<ServiceType>) => request<ServiceType>(`/service-types/${id(serviceTypeId)}`, json("PATCH", body)),
  getOfferings: (dealershipId: string) => request<ServiceOffering[]>(`/dealerships/${id(dealershipId)}/services`),
  createOffering: (dealershipId: string, body: { serviceTypeId: string; durationMinutes: number }) => request<ServiceOffering>(`/dealerships/${id(dealershipId)}/services`, json("POST", body)),
  updateOffering: (dealershipId: string, offeringId: string, body: { durationMinutes?: number; isActive?: boolean }) => request<ServiceOffering>(`/dealerships/${id(dealershipId)}/services/${id(offeringId)}`, json("PATCH", body)),

  getHours: (dealershipId: string) => request<WeeklyHours[]>(`/dealerships/${id(dealershipId)}/hours`),
  createHours: (dealershipId: string, body: Record<string, unknown>) => request<WeeklyHours>(`/dealerships/${id(dealershipId)}/hours`, json("POST", body)),
  updateHours: (dealershipId: string, hourId: string, body: Record<string, unknown>) => request<WeeklyHours>(`/dealerships/${id(dealershipId)}/hours/${id(hourId)}`, json("PATCH", body)),
  getClosures: (dealershipId: string) => request<ClosurePeriod[]>(`/dealerships/${id(dealershipId)}/closures`),
  createClosure: (dealershipId: string, body: Record<string, unknown>) => request<ClosurePeriod>(`/dealerships/${id(dealershipId)}/closures`, json("POST", body)),
  updateClosure: (dealershipId: string, closureId: string, body: Record<string, unknown>) => request<ClosurePeriod>(`/dealerships/${id(dealershipId)}/closures/${id(closureId)}`, json("PATCH", body)),
  deleteClosure: (dealershipId: string, closureId: string) => request<Entity>(`/dealerships/${id(dealershipId)}/closures/${id(closureId)}`, json("DELETE")),

  getTechnicians: (dealershipId: string) => request<Technician[]>(`/dealerships/${id(dealershipId)}/technicians`),
  createTechnician: (dealershipId: string, body: { displayName: string; employeeCode?: string }) => request<Technician>(`/dealerships/${id(dealershipId)}/technicians`, json("POST", body)),
  updateTechnician: (dealershipId: string, technicianId: string, body: Record<string, unknown>) => request<Technician>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}`, json("PATCH", body)),
  getQualifications: (dealershipId: string, technicianId: string) => request<Qualification[]>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/qualifications`),
  createQualification: (dealershipId: string, technicianId: string, body: Record<string, unknown>) => request<Qualification>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/qualifications`, json("POST", body)),
  updateQualification: (dealershipId: string, technicianId: string, serviceTypeId: string, body: Record<string, unknown>) => request<Qualification>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/qualifications/${id(serviceTypeId)}`, json("PATCH", body)),
  deleteQualification: (dealershipId: string, technicianId: string, serviceTypeId: string) => request<Entity>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/qualifications/${id(serviceTypeId)}`, json("DELETE")),
  getShifts: (dealershipId: string, technicianId: string) => request<TechnicianShift[]>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/shifts`),
  createShift: (dealershipId: string, technicianId: string, body: Record<string, unknown>) => request<TechnicianShift>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/shifts`, json("POST", body)),
  updateShift: (dealershipId: string, technicianId: string, shiftId: string, body: Record<string, unknown>) => request<TechnicianShift>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/shifts/${id(shiftId)}`, json("PATCH", body)),
  getLeaves: (dealershipId: string, technicianId: string) => request<TechnicianLeave[]>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/leaves`),
  createLeave: (dealershipId: string, technicianId: string, body: Record<string, unknown>) => request<TechnicianLeave>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/leaves`, json("POST", body)),
  updateLeave: (dealershipId: string, technicianId: string, leaveId: string, body: Record<string, unknown>) => request<TechnicianLeave>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/leaves/${id(leaveId)}`, json("PATCH", body)),
  deleteLeave: (dealershipId: string, technicianId: string, leaveId: string) => request<Entity>(`/dealerships/${id(dealershipId)}/technicians/${id(technicianId)}/leaves/${id(leaveId)}`, json("DELETE")),

  getBays: (dealershipId: string) => request<ServiceBay[]>(`/dealerships/${id(dealershipId)}/service-bays`),
  createBay: (dealershipId: string, body: { bayCode: string }) => request<ServiceBay>(`/dealerships/${id(dealershipId)}/service-bays`, json("POST", body)),
  updateBay: (dealershipId: string, bayId: string, body: Record<string, unknown>) => request<ServiceBay>(`/dealerships/${id(dealershipId)}/service-bays/${id(bayId)}`, json("PATCH", body)),
  getBayCapabilities: (dealershipId: string, bayId: string) => request<BayCapability[]>(`/dealerships/${id(dealershipId)}/service-bays/${id(bayId)}/capabilities`),
  createBayCapability: (dealershipId: string, bayId: string, serviceTypeId: string) => request<Entity>(`/dealerships/${id(dealershipId)}/service-bays/${id(bayId)}/capabilities`, json("POST", { serviceTypeId })),
  deleteBayCapability: (dealershipId: string, bayId: string, serviceTypeId: string) => request<Entity>(`/dealerships/${id(dealershipId)}/service-bays/${id(bayId)}/capabilities/${id(serviceTypeId)}`, json("DELETE")),

  availability: (values: { dealershipId: string; vehicleId: string; serviceTypeId: string; date: string; customerId?: string }) =>
    request<AvailabilityResult>(`/availability${queryString(values)}`),
  book: (body: { dealershipId: string; customerId?: string; vehicleId: string; serviceTypeId: string; startsAt: string }, staffAssisted: boolean) =>
    request<Appointment>(`/appointments/${staffAssisted ? "staff-assisted" : "self-service"}`, {
      ...json("POST", body),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
  getMyAppointments: (period: "upcoming" | "past") => request<Page<Appointment> | Appointment[]>(`/appointments/me${queryString({ period, limit: 100 })}`),
  getMyAppointment: (appointmentId: string) => request<Appointment>(`/appointments/me/${id(appointmentId)}`),
  getDealershipAppointments: (dealershipId: string, from: string, to: string, status?: string, customerId?: string) =>
    request<Page<Appointment> | Appointment[]>(`/dealerships/${id(dealershipId)}/appointments${queryString({ from, to, status, customerId, limit: 100 })}`),
  cancelAppointment: (appointmentId: string) => request<Appointment>(`/appointments/${id(appointmentId)}/cancel`, json("POST")),
  rescheduleAppointment: (appointmentId: string, startsAt: string) => request<Appointment>(`/appointments/${id(appointmentId)}/reschedule`, json("POST", { startsAt })),
  updateAppointmentStatus: (appointmentId: string, status: "completed" | "no_show") => request<Appointment>(`/appointments/${id(appointmentId)}/status`, json("PATCH", { status })),
};
