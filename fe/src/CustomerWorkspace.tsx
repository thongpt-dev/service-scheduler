import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { ArrowRight, CalendarClock, CarFront, Check, ChevronRight, MapPin, UserRound } from "lucide-react";
import { ApiError, api, type Appointment, type Customer, type Dealership, type Page, type Vehicle } from "./api";
import { BookingPanel } from "./BookingPanel";
import { dateTimeLocalToIso, formatInTimezone, hasNotStarted } from "./date-time";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Select, Spinner, StatusTag } from "./components/ui";

export type CustomerTab = "home" | "book" | "visits" | "garage";

function asItems<T>(result: T[] | Page<T>): T[] {
  return Array.isArray(result) ? result : result.items;
}

export function CustomerWorkspace({
  tab,
  onDealershipCreated,
}: {
  tab: CustomerTab;
  onDealershipCreated?: (dealership: Dealership) => void;
}) {
  const [profile, setProfile] = useState<Customer | null>(null);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [associated, setAssociated] = useState<Dealership[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [associateId, setAssociateId] = useState("");
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [newDealership, setNewDealership] = useState({ name: "", addressLine1: "", city: "", region: "", postalCode: "", countryCode: "US", timezone: "America/Los_Angeles" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadCustomerData(requestedPeriod: "upcoming" | "past" = period) {
    const results = await Promise.allSettled([
      api.getMyProfile(),
      api.getDealerships(),
      api.getMyDealerships(),
      api.getMyVehicles(),
      api.getMyAppointments(requestedPeriod),
    ]);
    const [profileResult, dealersResult, associatedResult, vehiclesResult, appointmentsResult] = results;
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
      setProfileForm({
        firstName: profileResult.value.firstName,
        lastName: profileResult.value.lastName,
        phone: profileResult.value.phone ?? "",
      });
    } else setError(messageOf(profileResult.reason));
    if (dealersResult.status === "fulfilled") setDealerships(dealersResult.value);
    if (associatedResult.status === "fulfilled") setAssociated(associatedResult.value);
    if (vehiclesResult.status === "fulfilled") setVehicles(vehiclesResult.value);
    if (appointmentsResult.status === "fulfilled") setAppointments(asItems(appointmentsResult.value));
    setLoading(false);
  }

  const refreshCustomerData = useEffectEvent(() => { void loadCustomerData(period); });
  // The effect synchronizes server data when the selected appointment period changes.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { refreshCustomerData(); }, [period]);

  function changePeriod(nextPeriod: "upcoming" | "past") {
    setLoading(true);
    setError("");
    setPeriod(nextPeriod);
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateMyProfile({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone || null,
      });
      setProfile(updated);
      setSuccess("Profile updated.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function associateDealership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!associateId) return;
    setBusy(true);
    setError("");
    try {
      await api.associateDealership(associateId);
      setAssociateId("");
      await loadCustomerData();
      setSuccess("Dealership linked to your profile.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function assignVehicle(vehicleId: string) {
    const dealershipId = assignTo[vehicleId];
    if (!dealershipId) return;
    setBusy(true);
    setError("");
    try {
      await api.assignVehicle(vehicleId, dealershipId);
      setAssignTo((current) => ({ ...current, [vehicleId]: "" }));
      await loadCustomerData();
      setSuccess("Vehicle assigned to the dealership.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function createDealership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createDealership(newDealership);
      onDealershipCreated?.(created);
      setSuccess("Dealership created. You are its owner.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function openAppointment(item: Appointment) {
    setError("");
    try { setSelected(await api.getMyAppointment(item.id)); }
    catch (caught) { setError(messageOf(caught)); }
  }

  async function cancelAppointment() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelAppointment(selected.id);
      setSelected(null);
      setSuccess("Appointment cancelled.");
      await loadCustomerData();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function rescheduleAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !rescheduleValue) return;
    setBusy(true);
    setError("");
    try {
      const timezone = dealerships.find((item) => item.id === selected.dealershipId)?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.rescheduleAppointment(selected.id, dateTimeLocalToIso(rescheduleValue, timezone));
      setSelected(null);
      setRescheduleValue("");
      setSuccess("Appointment rescheduled.");
      await loadCustomerData();
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  const nextAppointment = appointments.find((item) => item.status === "confirmed");

  return (
    <div className="workspace-content">
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {loading && tab !== "book" ? <Spinner label="Loading your details" /> : null}

      {tab === "home" && !loading && (
        <>
          <div className="welcome-block">
            <p className="eyebrow">YOUR SERVICE SPACE</p>
            <h1>Good day{profile?.firstName ? `, ${profile.firstName}` : ""}.</h1>
            <p>Keep the next visit simple.</p>
          </div>
          <button className="booking-hero" type="button" onClick={() => window.dispatchEvent(new CustomEvent("scheduler:navigate", { detail: "book" }))}>
            <span className="hero-kicker">READY WHEN YOU ARE</span>
            <strong>Book your next service</strong>
            <span className="hero-arrow"><ArrowRight size={18} /></span>
            <span className="hero-art" aria-hidden="true"><CarFront size={90} strokeWidth={1.1} /></span>
          </button>
          <SectionHeading eyebrow="UP NEXT" title="Your appointments" action={<button className="inline-link" type="button" onClick={() => window.dispatchEvent(new CustomEvent("scheduler:navigate", { detail: "visits" }))}>View all <ChevronRight size={15} /></button>} />
          {nextAppointment ? (
            <AppointmentCard appointment={nextAppointment} timezone={dealerships.find((item) => item.id === nextAppointment.dealershipId)?.timezone} onClick={() => void openAppointment(nextAppointment)} />
          ) : (
            <Card><EmptyState title="Nothing on the calendar" detail="When you book a service, you'll find it here." /></Card>
          )}
          <SectionHeading eyebrow="YOUR GARAGE" title={`${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`} />
          <Card className="garage-summary">
            {vehicles.slice(0, 2).map((vehicle) => <div className="vehicle-line" key={vehicle.id}><span className="vehicle-icon"><CarFront size={19} /></span><span><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>{vehicle.vin}</small></span></div>)}
            {!vehicles.length && <p className="muted-copy">Your dealership can add vehicles during service intake.</p>}
          </Card>
        </>
      )}

      {tab === "book" && (
        <>
          <div className="page-intro"><p className="eyebrow">CUSTOMER BOOKING</p><h1>Find your time.</h1><p>Choose a dealership, vehicle, service, and date.</p></div>
          <BookingPanel mode="customer" onBooked={() => { setSuccess("Appointment confirmed."); void loadCustomerData(); }} />
        </>
      )}

      {tab === "visits" && (
        <>
          <SectionHeading eyebrow="YOUR SERVICE HISTORY" title="Appointments" />
          <div className="segmented period-switch">
            <button type="button" className={period === "upcoming" ? "selected" : ""} onClick={() => changePeriod("upcoming")}>Upcoming</button>
            <button type="button" className={period === "past" ? "selected" : ""} onClick={() => changePeriod("past")}>Past</button>
          </div>
          <div className="appointment-list">
            {appointments.map((item) => <AppointmentCard key={item.id} appointment={item} timezone={dealerships.find((dealer) => dealer.id === item.dealershipId)?.timezone} onClick={() => void openAppointment(item)} />)}
            {!appointments.length && <Card><EmptyState title={`No ${period} appointments`} detail="Your service visits will appear here." /></Card>}
          </div>
          {selected && <AppointmentDetail appointment={selected} timezone={dealerships.find((item) => item.id === selected.dealershipId)?.timezone} busy={busy} rescheduleValue={rescheduleValue} onRescheduleValue={setRescheduleValue} onCancel={() => void cancelAppointment()} onReschedule={(event) => void rescheduleAppointment(event)} onClose={() => setSelected(null)} />}
        </>
      )}

      {tab === "garage" && (
        <>
          <SectionHeading eyebrow="ACCOUNT & VEHICLES" title="Your garage" />
          <Card>
            <div className="card-title-row"><span className="round-icon"><UserRound size={18} /></span><div><strong>Profile details</strong><small>{profile?.email}</small></div></div>
            <form className="stack-form compact-form" onSubmit={(event) => void updateProfile(event)}>
              <div className="form-grid-two">
                <Field label="First name"><Input required value={profileForm.firstName} onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })} /></Field>
                <Field label="Last name"><Input required value={profileForm.lastName} onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })} /></Field>
              </div>
              <Field label="Phone"><Input type="tel" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></Field>
              <Button type="submit" variant="secondary" disabled={busy}>Save profile <Check size={15} /></Button>
            </form>
          </Card>
          <Card>
            <div className="card-title-row"><span className="round-icon"><MapPin size={18} /></span><div><strong>Dealerships</strong><small>Choose where your profile is associated</small></div></div>
            <div className="chip-list">{associated.map((item) => <span className="quiet-chip" key={item.id}>{item.name}</span>)}{!associated.length && <span className="muted-copy">No dealership linked yet.</span>}</div>
            <form className="inline-form" onSubmit={(event) => void associateDealership(event)}>
              <Select value={associateId} onChange={(event) => setAssociateId(event.target.value)}>
                <option value="">Add a dealership</option>
                {dealerships.filter((item) => !associated.some((linked) => linked.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <Button type="submit" variant="secondary" disabled={busy || !associateId}>Add</Button>
            </form>
          </Card>
          <SectionHeading eyebrow="OWNED OR SHARED" title="Vehicles" />
          {!vehicles.length && <Card><EmptyState title="No vehicles yet" detail="A dealership staff member can add a vehicle during intake." /></Card>}
          {vehicles.map((vehicle) => (
            <Card className="vehicle-card" key={vehicle.id}>
              <div className="card-title-row"><span className="vehicle-icon"><CarFront size={20} /></span><div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>VIN {vehicle.vin}</small></div></div>
              <div className="vehicle-dealerships">
                <span className="field-label">Assigned dealerships</span>
                <div className="chip-list">
                  {(vehicle.dealershipAssignments ?? []).map((assignment) => <span className={assignment.isDealershipActive ? "quiet-chip" : "quiet-chip inactive-chip"} key={assignment.dealershipId}>{assignment.dealershipName} · {assignment.dealershipCity}{!assignment.isDealershipActive && " · Inactive"}</span>)}
                  {!(vehicle.dealershipAssignments?.length) && <span className="muted-copy">Not assigned to a dealership</span>}
                </div>
              </div>
              {vehicle.ownerCustomerId === profile?.id && (
                <div className="inline-form assign-row">
                  <Select value={assignTo[vehicle.id] ?? ""} onChange={(event) => setAssignTo({ ...assignTo, [vehicle.id]: event.target.value })}>
                    <option value="">Add to another dealership</option>
                    {dealerships.filter((item) => !vehicle.dealershipAssignments?.some((assignment) => assignment.dealershipId === item.id)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </Select>
                  <Button size="small" variant="secondary" disabled={busy || !assignTo[vehicle.id]} onClick={() => void assignVehicle(vehicle.id)}>Add</Button>
                </div>
              )}
              {vehicle.ownerCustomerId !== profile?.id && <p className="field-hint">Shared with you. Only the owner can assign this vehicle to a dealership.</p>}
            </Card>
          ))}
          <Card>
            <div className="card-title-row"><span className="round-icon"><MapPin size={18} /></span><div><strong>Manage a dealership?</strong><small>Create a workspace for your service center.</small></div></div>
            <form className="stack-form compact-form" onSubmit={(event) => void createDealership(event)}>
              <Field label="Dealership name"><Input required value={newDealership.name} onChange={(event) => setNewDealership({ ...newDealership, name: event.target.value })} /></Field>
              <Field label="Street address"><Input required value={newDealership.addressLine1} onChange={(event) => setNewDealership({ ...newDealership, addressLine1: event.target.value })} /></Field>
              <div className="form-grid-two"><Field label="City"><Input required value={newDealership.city} onChange={(event) => setNewDealership({ ...newDealership, city: event.target.value })} /></Field><Field label="Region"><Input required value={newDealership.region} onChange={(event) => setNewDealership({ ...newDealership, region: event.target.value })} /></Field></div>
              <div className="form-grid-two"><Field label="Postal code"><Input required value={newDealership.postalCode} onChange={(event) => setNewDealership({ ...newDealership, postalCode: event.target.value })} /></Field><Field label="Country code"><Input required maxLength={2} value={newDealership.countryCode} onChange={(event) => setNewDealership({ ...newDealership, countryCode: event.target.value.toUpperCase() })} /></Field></div>
              <Field label="IANA timezone"><Input required value={newDealership.timezone} onChange={(event) => setNewDealership({ ...newDealership, timezone: event.target.value })} /></Field>
              <Button type="submit" disabled={busy}>Create dealership <ChevronRight size={15} /></Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function AppointmentCard({ appointment, timezone, onClick }: { appointment: Appointment; timezone?: string; onClick: () => void }) {
  return (
    <button type="button" className="appointment-card" onClick={onClick}>
      <span className="appointment-date"><CalendarClock size={18} /><small>{new Date(appointment.startsAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></span>
      <span className="appointment-main"><strong>{appointment.serviceNameSnapshot}</strong><small>{formatWhen(appointment.startsAt, timezone)} · {appointment.durationMinutesSnapshot} min</small></span>
      <StatusTag status={appointment.status} />
      <ChevronRight className="appointment-chevron" size={16} />
    </button>
  );
}

function AppointmentDetail({
  appointment,
  timezone,
  busy,
  rescheduleValue,
  onRescheduleValue,
  onCancel,
  onReschedule,
  onClose,
}: {
  appointment: Appointment;
  timezone?: string;
  busy: boolean;
  rescheduleValue: string;
  onRescheduleValue: (value: string) => void;
  onCancel: () => void;
  onReschedule: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const canChange = appointment.status === "confirmed" && hasNotStarted(appointment.startsAt);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
        <div className="sheet-handle" />
        <div className="sheet-heading"><div><p className="eyebrow">APPOINTMENT</p><h2 id="appointment-detail-title">{appointment.appointmentRef}</h2></div><Button variant="quiet" size="small" onClick={onClose}>Done</Button></div>
        <div className="detail-facts">
          <div><small>SERVICE</small><strong>{appointment.serviceNameSnapshot}</strong></div>
          <div><small>WHEN</small><strong>{formatWhen(appointment.startsAt, timezone)}</strong></div>
          <div><small>DURATION</small><strong>{appointment.durationMinutesSnapshot} minutes</strong></div>
          <div><small>STATUS</small><StatusTag status={appointment.status} /></div>
        </div>
        {canChange && (
          <>
            <form className="stack-form" onSubmit={onReschedule}>
              <Field label="New start time"><Input required type="datetime-local" value={rescheduleValue} onChange={(event) => onRescheduleValue(event.target.value)} /></Field>
              <Button type="submit" variant="secondary" disabled={busy || !rescheduleValue}>Reschedule</Button>
            </form>
            <Button variant="danger" onClick={onCancel} disabled={busy}>Cancel appointment</Button>
          </>
        )}
      </section>
    </div>
  );
}

function formatWhen(value: string, timezone?: string): string {
  return formatInTimezone(value, timezone, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function messageOf(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "Request failed. Try again.";
}
