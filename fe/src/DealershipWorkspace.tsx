import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CarFront, Check, ChevronRight, Plus, Search } from "lucide-react";
import { ApiError, api, type Appointment, type Customer, type Dealership, type Page, type ServiceBay, type Technician, type Vehicle } from "./api";
import { BookingPanel } from "./BookingPanel";
import { SetupWorkspace } from "./SetupWorkspace";
import { dateTimeLocalToIso, formatInTimezone, localDayBounds } from "./date-time";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Select, Spinner, StatusTag } from "./components/ui";

export type DealershipTab = "schedule" | "book" | "customers" | "setup";

function asItems<T>(result: T[] | Page<T>): T[] {
  return Array.isArray(result) ? result : result.items;
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string): string {
  return new Date(value).toLocaleString();
}

function dealershipTimezone(dealerships: Dealership[], dealershipId: string): string {
  return dealerships.find((item) => item.id === dealershipId)?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function DealershipWorkspace({ tab }: { tab: DealershipTab }) {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [dealershipId, setDealershipId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [date, setDate] = useState(() => localDate(new Date()));
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilterId, setCustomerFilterId] = useState("");
  const [technicianFilterId, setTechnicianFilterId] = useState("");
  const [bayFilterId, setBayFilterId] = useState("");
  const [scheduleTechnicians, setScheduleTechnicians] = useState<Technician[]>([]);
  const [scheduleBays, setScheduleBays] = useState<ServiceBay[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [staffRescheduleTime, setStaffRescheduleTime] = useState("");
  const [customerForm, setCustomerForm] = useState({ email: "", firstName: "", lastName: "", phone: "" });
  const [customerEdit, setCustomerEdit] = useState({ firstName: "", lastName: "", phone: "" });
  const [vehicleForm, setVehicleForm] = useState(() => ({ vin: "", make: "", model: "", year: String(new Date().getFullYear() - 1) }));
  const [vehicleEditId, setVehicleEditId] = useState("");
  const [vehicleEdit, setVehicleEdit] = useState({ make: "", model: "", year: "" });
  const [shareVehicleId, setShareVehicleId] = useState("");
  const [shareCustomerId, setShareCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadAccessibleDealerships() {
      const listed = await api.getDealerships();
      if (localStorage.getItem("service-scheduler.workspace") !== "dealership") return listed;
      const checks = await Promise.all(listed.map(async (item) => {
        try {
          await api.getTechnicians(item.id);
          return item;
        } catch {
          return null;
        }
      }));
      return checks.filter((item): item is Dealership => item !== null);
    }
    loadAccessibleDealerships().then((items) => {
      if (cancelled) return;
      setDealerships(items);
      const previousId = localStorage.getItem("service-scheduler.dealership-id");
      const initial = items.find((item) => item.id === previousId)?.id ?? items[0]?.id ?? "";
      setDealershipId(initial);
      if (!items.length) setError("No active dealership membership is available for this staff account.");
    }).catch((caught: unknown) => {
      if (!cancelled) setError(messageOf(caught));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function loadPeople() {
    try { setCustomers(await api.getDealershipCustomers(dealershipId)); }
    catch (caught) { setError(messageOf(caught)); }
  }

  async function loadSchedule() {
    try {
      const [dayStart, dayEnd] = localDayBounds(date, dealershipTimezone(dealerships, dealershipId));
      const result = await api.getDealershipAppointments(
        dealershipId,
        dayStart.toISOString(),
        dayEnd.toISOString(),
        statusFilter || undefined,
        customerFilterId || undefined,
      );
      setAppointments(asItems(result));
    } catch (caught) { setError(messageOf(caught)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!dealershipId) return;
    localStorage.setItem("service-scheduler.dealership-id", dealershipId);
  }, [dealershipId]);
  useEffect(() => {
    if (!dealershipId || (tab !== "schedule" && tab !== "customers" && tab !== "book")) return;
    let active = true;
    void api.getDealershipCustomers(dealershipId).then((rows) => {
      if (active) setCustomers(rows);
    }).catch((caught: unknown) => {
      if (active) setError(messageOf(caught));
    });
    return () => { active = false; };
  }, [dealershipId, tab]);
  useEffect(() => {
    if (!dealershipId || tab !== "schedule") return;
    let active = true;
    const [dayStart, dayEnd] = localDayBounds(date, dealershipTimezone(dealerships, dealershipId));
    void api.getDealershipAppointments(
      dealershipId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      statusFilter || undefined,
    ).then((result) => {
      if (active) setAppointments(asItems(result));
    }).catch((caught: unknown) => {
      if (active) setError(messageOf(caught));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [dealershipId, dealerships, tab, date, statusFilter, customerFilterId]);
  useEffect(() => {
    if (!dealershipId || tab !== "schedule") return;
    let active = true;
    void Promise.all([api.getTechnicians(dealershipId), api.getBays(dealershipId)]).then(([techs, bays]) => {
      if (active) {
        setScheduleTechnicians(techs);
        setScheduleBays(bays);
      }
    }).catch((caught: unknown) => {
      if (active) setError(messageOf(caught));
    });
    return () => { active = false; };
  }, [dealershipId, tab]);

  async function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerEdit({ firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone ?? "" });
    setCustomerVehicles([]);
    setError("");
    try { setCustomerVehicles(await api.getCustomerVehicles(dealershipId, customer.id)); }
    catch (caught) { setError(messageOf(caught)); }
  }

  async function saveCustomerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateDealershipCustomer(dealershipId, selectedCustomer.id, { ...customerEdit, phone: customerEdit.phone || null });
      setSelectedCustomer(updated);
      await loadPeople();
      setSuccess("Customer profile updated.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createDealershipCustomer(dealershipId, customerForm);
      setCustomerForm({ email: "", firstName: "", lastName: "", phone: "" });
      await loadPeople();
      await selectCustomer(created);
      setSuccess("Customer profile created for this dealership.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setBusy(true);
    setError("");
    try {
      await api.createCustomerVehicle(dealershipId, selectedCustomer.id, {
        ...vehicleForm,
        year: Number(vehicleForm.year),
      });
      setVehicleForm({ vin: "", make: "", model: "", year: String(new Date().getFullYear() - 1) });
      await selectCustomer(selectedCustomer);
      setSuccess("Vehicle added and assigned to this dealership.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function changeVehicle(vehicle: Vehicle, isActive: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.updateDealershipVehicle(dealershipId, vehicle.id, { isActive });
      if (selectedCustomer) await selectCustomer(selectedCustomer);
      setSuccess(isActive ? "Vehicle reactivated." : "Vehicle deactivated.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  function beginVehicleEdit(vehicle: Vehicle) {
    setVehicleEditId(vehicle.id);
    setVehicleEdit({ make: vehicle.make, model: vehicle.model, year: String(vehicle.year) });
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleEditId || !selectedCustomer) return;
    setBusy(true);
    setError("");
    try {
      await api.updateDealershipVehicle(dealershipId, vehicleEditId, { ...vehicleEdit, year: Number(vehicleEdit.year) });
      setVehicleEditId("");
      await selectCustomer(selectedCustomer);
      setSuccess("Vehicle details updated.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function grantVehicleAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shareVehicleId || !shareCustomerId) return;
    setBusy(true);
    setError("");
    try {
      await api.grantVehicleAccess(dealershipId, shareCustomerId, shareVehicleId);
      setShareVehicleId("");
      setShareCustomerId("");
      setSuccess("Vehicle access granted to the selected customer.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function revokeVehicleAccess(vehicleId: string) {
    if (!selectedCustomer) return;
    setBusy(true);
    setError("");
    try {
      await api.revokeVehicleAccess(dealershipId, selectedCustomer.id, vehicleId);
      await selectCustomer(selectedCustomer);
      setSuccess("Shared vehicle access revoked.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function updateAppointmentStatus(appointmentId: string, status: "completed" | "no_show") {
    setBusy(true);
    setError("");
    try {
      await api.updateAppointmentStatus(appointmentId, status);
      setSelectedAppointment(null);
      await loadSchedule();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function rescheduleStaffAppointment() {
    if (!selectedAppointment || !staffRescheduleTime) return;
    setBusy(true);
    setError("");
    try {
      await api.rescheduleAppointment(selectedAppointment.id, dateTimeLocalToIso(staffRescheduleTime, dealershipTimezone(dealerships, dealershipId)));
      setSelectedAppointment(null);
      setStaffRescheduleTime("");
      setSuccess("Appointment rescheduled.");
      await loadSchedule();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  function changeScheduleDate(value: string) {
    setLoading(true);
    setError("");
    setDate(value);
  }

  function changeScheduleStatus(value: string) {
    setLoading(true);
    setError("");
    setStatusFilter(value);
  }

  function changeScheduleCustomer(value: string) {
    setLoading(true);
    setError("");
    setCustomerFilterId(value);
  }

  const visibleAppointments = appointments.filter((item) =>
    (!technicianFilterId || item.assignedTechnicianId === technicianFilterId) &&
    (!bayFilterId || item.assignedBayId === bayFilterId),
  );

  const selectedDealership = dealerships.find((item) => item.id === dealershipId);
  const filteredCustomers = customers.filter((customer) =>
    `${customer.firstName} ${customer.lastName} ${customer.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  if (loading && !dealerships.length) return <div className="workspace-content"><Spinner label="Loading dealership" /></div>;

  return (
    <div className="workspace-content">
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      <Field label="Active dealership" className="dealership-picker">
        <Select value={dealershipId} onChange={(event) => setDealershipId(event.target.value)}>
          {dealerships.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          {!dealerships.length && <option value="">No dealerships available</option>}
        </Select>
      </Field>
      {dealerships.length === 0 && tab !== "setup" && (
        <Card><EmptyState title="No dealership selected" detail="Create a dealership in Setup to begin." /></Card>
      )}

      {tab === "schedule" && (
        <>
          <SectionHeading eyebrow="DEALERSHIP DESK" title="Schedule" />
          <div className="schedule-filters">
            <Field label="Service date"><Input type="date" value={date} onChange={(event) => changeScheduleDate(event.target.value)} /></Field>
            <Field label="Status"><Select value={statusFilter} onChange={(event) => changeScheduleStatus(event.target.value)}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option><option value="no_show">No show</option></Select></Field>
          </div>
          <div className="schedule-resource-filters">
            <Field label="Customer"><Select value={customerFilterId} onChange={(event) => changeScheduleCustomer(event.target.value)}><option value="">All customers</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.firstName} {customer.lastName}</option>)}</Select></Field>
            <Field label="Technician"><Select value={technicianFilterId} onChange={(event) => setTechnicianFilterId(event.target.value)}><option value="">All technicians</option>{scheduleTechnicians.map((technician) => <option value={technician.id} key={technician.id}>{technician.displayName}</option>)}</Select></Field>
            <Field label="Bay"><Select value={bayFilterId} onChange={(event) => setBayFilterId(event.target.value)}><option value="">All bays</option>{scheduleBays.map((bay) => <option value={bay.id} key={bay.id}>{bay.bayCode}</option>)}</Select></Field>
          </div>
          <div className="schedule-day-label"><CalendarDays size={16} /><span>{formatInTimezone(`${date}T12:00:00Z`, selectedDealership?.timezone, { weekday: "long", month: "long", day: "numeric" })}</span><span className="schedule-count">{appointments.length} visits</span></div>
          {loading ? <Spinner label="Loading schedule" /> : visibleAppointments.length ? (
            <div className="schedule-list">{visibleAppointments.map((item) => {
              const customer = customers.find((person) => person.id === item.customerId);
              return <button className="schedule-row" key={item.id} onClick={() => setSelectedAppointment(item)} type="button">
                <span className="schedule-time">{formatInTimezone(item.startsAt, selectedDealership?.timezone, { hour: "numeric", minute: "2-digit" })}<small>{item.durationMinutesSnapshot}m</small></span>
                <span className="schedule-detail"><strong>{item.serviceNameSnapshot}</strong><small>{customer ? `${customer.firstName} ${customer.lastName}` : item.appointmentRef}</small></span>
                <StatusTag status={item.status} /><ChevronRight size={15} />
              </button>;
            })}</div>
          ) : <Card><EmptyState title="No visits for this day" detail="Choose another date or clear the status filter." /></Card>}
          {selectedAppointment && <StaffAppointmentDetail appointment={selectedAppointment} busy={busy} rescheduleValue={staffRescheduleTime} onRescheduleValue={setStaffRescheduleTime} onReschedule={() => void rescheduleStaffAppointment()} onClose={() => setSelectedAppointment(null)} onCancel={async () => { setBusy(true); try { await api.cancelAppointment(selectedAppointment.id); setSelectedAppointment(null); await loadSchedule(); } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); } }} onStatus={(status) => void updateAppointmentStatus(selectedAppointment.id, status)} />}
        </>
      )}

      {tab === "book" && (
        <>
          <div className="page-intro"><p className="eyebrow">STAFF-ASSISTED</p><h1>Book for a customer.</h1><p>Confirm details with them before reserving a time.</p></div>
          {dealershipId ? <BookingPanel mode="staff" dealershipId={dealershipId} customers={customers} onBooked={() => { setSuccess("Appointment confirmed for the customer."); void loadSchedule(); }} /> : <Card><EmptyState title="Select a dealership" detail="An active dealership is needed for assisted booking." /></Card>}
        </>
      )}

      {tab === "customers" && (
        <>
          <SectionHeading eyebrow="CUSTOMER RECORDS" title="People & vehicles" />
          <Card>
            <div className="card-title-row"><span className="round-icon"><Plus size={17} /></span><div><strong>Add a customer profile</strong><small>Creates a profile, not login credentials.</small></div></div>
            <form className="stack-form compact-form" onSubmit={(event) => void createCustomer(event)}>
              <div className="form-grid-two"><Field label="First name"><Input required value={customerForm.firstName} onChange={(event) => setCustomerForm({ ...customerForm, firstName: event.target.value })} /></Field><Field label="Last name"><Input required value={customerForm.lastName} onChange={(event) => setCustomerForm({ ...customerForm, lastName: event.target.value })} /></Field></div>
              <Field label="Email"><Input required type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></Field>
              <Field label="Phone (optional)"><Input type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></Field>
              <Button type="submit" disabled={busy}>Create profile <Plus size={15} /></Button>
            </form>
          </Card>
          <Field label="Find a customer"><span className="search-input"><Search size={17} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" /></span></Field>
          <div className="customer-list">
            {filteredCustomers.map((customer) => (
              <button type="button" className={selectedCustomer?.id === customer.id ? "customer-row selected" : "customer-row"} key={customer.id} onClick={() => void selectCustomer(customer)}>
                <span className="avatar-initials">{customer.firstName[0]}{customer.lastName[0]}</span><span><strong>{customer.firstName} {customer.lastName}</strong><small>{customer.email}</small></span><ChevronRight size={16} />
              </button>
            ))}
            {!filteredCustomers.length && <Card><EmptyState title="No matching customers" detail="Create a profile above or change your search." /></Card>}
          </div>
          {selectedCustomer && (
            <Card className="selected-customer-card">
              <SectionHeading eyebrow="SELECTED CUSTOMER" title={`${selectedCustomer.firstName} ${selectedCustomer.lastName}`} />
              <form className="stack-form compact-form" onSubmit={(event) => void saveCustomerProfile(event)}>
                <div className="form-grid-two"><Field label="First name"><Input required value={customerEdit.firstName} onChange={(event) => setCustomerEdit({ ...customerEdit, firstName: event.target.value })} /></Field><Field label="Last name"><Input required value={customerEdit.lastName} onChange={(event) => setCustomerEdit({ ...customerEdit, lastName: event.target.value })} /></Field></div>
                <Field label="Phone"><Input type="tel" value={customerEdit.phone} onChange={(event) => setCustomerEdit({ ...customerEdit, phone: event.target.value })} /></Field>
                <Button type="submit" variant="secondary" size="small" disabled={busy}>Save customer details</Button>
              </form>
              <div className="card-title-row"><span className="round-icon"><CarFront size={18} /></span><div><strong>Assigned vehicles</strong><small>Only dealership-assigned vehicles are shown.</small></div></div>
              {customerVehicles.map((vehicle) => <div className="vehicle-manage" key={vehicle.id}><div className="vehicle-line"><span className="vehicle-icon"><CarFront size={18} /></span><span><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>{vehicle.vin}</small></span>{vehicle.ownerCustomerId === selectedCustomer.id ? <><Button variant="quiet" size="small" disabled={busy} onClick={() => beginVehicleEdit(vehicle)}>Edit</Button><Button variant="quiet" size="small" disabled={busy} onClick={() => void changeVehicle(vehicle, vehicle.isActive === false)}>{vehicle.isActive === false ? "Reactivate" : "Deactivate"}</Button></> : <Button variant="quiet" size="small" disabled={busy} onClick={() => void revokeVehicleAccess(vehicle.id)}>Revoke access</Button>}</div>{vehicleEditId === vehicle.id && <form className="stack-form compact-form vehicle-edit-form" onSubmit={(event) => void saveVehicle(event)}><div className="form-grid-two"><Field label="Make"><Input required value={vehicleEdit.make} onChange={(event) => setVehicleEdit({ ...vehicleEdit, make: event.target.value })} /></Field><Field label="Model"><Input required value={vehicleEdit.model} onChange={(event) => setVehicleEdit({ ...vehicleEdit, model: event.target.value })} /></Field></div><Field label="Year"><Input required type="number" min="1886" max="2100" value={vehicleEdit.year} onChange={(event) => setVehicleEdit({ ...vehicleEdit, year: event.target.value })} /></Field><div className="inline-form"><Button type="submit" size="small" disabled={busy}>Save vehicle</Button><Button variant="quiet" size="small" onClick={() => setVehicleEditId("")}>Close</Button></div></form>}</div>)}
              {!customerVehicles.length && <p className="muted-copy">No assigned vehicle is available for this customer.</p>}
              <form className="stack-form compact-form intake-form" onSubmit={(event) => void createVehicle(event)}>
                <p className="eyebrow">STAFF INTAKE</p>
                <div className="form-grid-two"><Field label="Make"><Input required value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} /></Field><Field label="Model"><Input required value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} /></Field></div>
                <div className="form-grid-two"><Field label="Year"><Input required type="number" min="1886" max="2100" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} /></Field><Field label="VIN"><Input required maxLength={17} value={vehicleForm.vin} onChange={(event) => setVehicleForm({ ...vehicleForm, vin: event.target.value.toUpperCase() })} /></Field></div>
                <Button type="submit" variant="secondary" disabled={busy}>Add vehicle to customer</Button>
              </form>
              <form className="stack-form compact-form intake-form" onSubmit={(event) => void grantVehicleAccess(event)}>
                <p className="eyebrow">SHARE VEHICLE ACCESS</p>
                <Field label="Owned vehicle"><Select required value={shareVehicleId} onChange={(event) => setShareVehicleId(event.target.value)}><option value="">Choose a vehicle</option>{customerVehicles.filter((vehicle) => vehicle.ownerCustomerId === selectedCustomer.id).map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}</option>)}</Select></Field>
                <Field label="Give access to"><Select required value={shareCustomerId} onChange={(event) => setShareCustomerId(event.target.value)}><option value="">Choose another customer</option>{customers.filter((customer) => customer.id !== selectedCustomer.id).map((customer) => <option value={customer.id} key={customer.id}>{customer.firstName} {customer.lastName}</option>)}</Select></Field>
                <Button type="submit" variant="secondary" disabled={busy}>Grant vehicle access</Button>
              </form>
            </Card>
          )}
        </>
      )}

      {tab === "setup" && <SetupWorkspace key={selectedDealership?.id ?? "create"} dealership={selectedDealership} onDealershipCreated={(created) => { setDealerships((current) => [created, ...current]); setDealershipId(created.id); }} />}
    </div>
  );
}

function StaffAppointmentDetail({
  appointment,
  busy,
  rescheduleValue,
  onRescheduleValue,
  onReschedule,
  onClose,
  onCancel,
  onStatus,
}: {
  appointment: Appointment;
  busy: boolean;
  rescheduleValue: string;
  onRescheduleValue: (value: string) => void;
  onReschedule: () => void;
  onClose: () => void;
  onCancel: () => void;
  onStatus: (status: "completed" | "no_show") => void;
}) {
  const { canCancel, canMarkNoShow, canComplete } = appointmentActions(appointment);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="staff-appointment-title">
        <div className="sheet-handle" />
        <div className="sheet-heading"><div><p className="eyebrow">SCHEDULE DETAIL</p><h2 id="staff-appointment-title">{appointment.appointmentRef}</h2></div><Button variant="quiet" size="small" onClick={onClose}>Done</Button></div>
        <div className="detail-facts"><div><small>SERVICE</small><strong>{appointment.serviceNameSnapshot}</strong></div><div><small>WHEN</small><strong>{displayDate(appointment.startsAt)}</strong></div><div><small>STATUS</small><StatusTag status={appointment.status} /></div></div>
        <div className="action-stack">
          {appointment.status === "confirmed" && <div className="inline-form"><Input aria-label="New appointment start" type="datetime-local" value={rescheduleValue} onChange={(event) => onRescheduleValue(event.target.value)} /><Button variant="secondary" disabled={busy || !rescheduleValue} onClick={onReschedule}>Move</Button></div>}
          {canCancel && <Button variant="danger" disabled={busy} onClick={onCancel}>Cancel visit</Button>}
          {canMarkNoShow && <Button variant="secondary" disabled={busy} onClick={() => onStatus("no_show")}>Mark no-show</Button>}
          {canComplete && <Button variant="secondary" disabled={busy} onClick={() => onStatus("completed")}>Mark completed <Check size={16} /></Button>}
        </div>
      </section>
    </div>
  );
}

function appointmentActions(appointment: Appointment) {
  const now = Date.now();
  const startsAt = Date.parse(appointment.startsAt);
  const endsAt = Date.parse(appointment.endsAt);
  return {
    canCancel: appointment.status === "confirmed" && startsAt > now,
    canMarkNoShow: appointment.status === "confirmed" && startsAt <= now,
    canComplete: appointment.status === "confirmed" && endsAt <= now,
  };
}

function messageOf(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "Request failed. Try again.";
}
