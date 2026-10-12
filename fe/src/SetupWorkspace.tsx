import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { Building2, CalendarClock, Check, Clock3, Cog, Plus, ShieldCheck, Trash2, UserPlus, Wrench } from "lucide-react";
import { ApiError, api, getAccessToken, type BayCapability, type Dealership, type Entity, type Membership, type ServiceBay, type ServiceOffering, type ServiceType, type Technician, type TechnicianLeave, type TechnicianShift, type WeeklyHours } from "./api";
import { dateTimeLocalToIso, formatInTimezone, instantToDateTimeLocal } from "./date-time";
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Select, Spinner } from "./components/ui";

type SetupTab = "overview" | "hours" | "services" | "team" | "bays";
interface DealershipFormValues {
  name: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
}

function formForDealership(dealership?: Dealership): DealershipFormValues {
  return {
    name: dealership?.name ?? "",
    addressLine1: dealership?.addressLine1 ?? "",
    city: dealership?.city ?? "",
    region: dealership?.region ?? "",
    postalCode: dealership?.postalCode ?? "",
    countryCode: dealership?.countryCode ?? "US",
    timezone: dealership?.timezone ?? "America/Los_Angeles",
  };
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function currentUserId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string }).sub ?? null;
  } catch { return null; }
}

export function SetupWorkspace({
  dealership,
  onDealershipCreated,
}: {
  dealership?: Dealership;
  onDealershipCreated: (dealership: Dealership) => void;
}) {
  const [tab, setTab] = useState<SetupTab>("overview");
  const [canConfigure, setCanConfigure] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [hours, setHours] = useState<WeeklyHours[]>([]);
  const [closures, setClosures] = useState<Entity[]>([]);
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [bays, setBays] = useState<ServiceBay[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, BayCapability[]>>({});
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [technicianEdit, setTechnicianEdit] = useState({ displayName: "", employeeCode: "" });
  const [qualificationForm, setQualificationForm] = useState({ serviceTypeId: "", validFrom: "", validTo: "" });
  const [qualificationEditId, setQualificationEditId] = useState("");
  const [shiftEditId, setShiftEditId] = useState("");
  const [bayCodeDrafts, setBayCodeDrafts] = useState<Record<string, string>>({});
  const [qualifications, setQualifications] = useState<Entity[]>([]);
  const [shifts, setShifts] = useState<TechnicianShift[]>([]);
  const [leaves, setLeaves] = useState<TechnicianLeave[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dealershipForm, setDealershipForm] = useState<DealershipFormValues>(() => formForDealership(dealership));
  const [hourForm, setHourForm] = useState({ dayOfWeek: "1", openTime: "08:00:00", closeTime: "17:00:00", isClosed: false });
  const [closureForm, setClosureForm] = useState({ startsAt: "", endsAt: "", reason: "" });
  const [closureEditId, setClosureEditId] = useState("");
  const [serviceForm, setServiceForm] = useState({ name: "", description: "", durationMinutes: "60" });
    const [serviceFormMode, setServiceFormMode] = useState<"new" | "existing">("new");
    const [existingServiceTypeId, setExistingServiceTypeId] = useState("");
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({});
  const [technicianForm, setTechnicianForm] = useState({ displayName: "", employeeCode: "" });
  const [shiftForm, setShiftForm] = useState({ dayOfWeek: "1", startLocalTime: "08:00:00", endLocalTime: "17:00:00" });
  const [leaveForm, setLeaveForm] = useState({ startsAt: "", endsAt: "", reason: "" });
  const [leaveEditId, setLeaveEditId] = useState("");
  const [bayForm, setBayForm] = useState({ bayCode: "" });
  const [staffForm, setStaffForm] = useState({ email: "", password: "", role: "staff" });
  const [capabilityChoice, setCapabilityChoice] = useState<Record<string, string>>({});

  async function loadSetup() {
    if (!dealership) return;
    const id = dealership.id;
    const results = await Promise.allSettled([
      api.getMemberships(id), api.getHours(id), api.getClosures(id), api.getOfferings(id),
      api.getServiceTypes(), api.getTechnicians(id), api.getBays(id),
    ]);
    const [membershipResult, hoursResult, closuresResult, offeringsResult, servicesResult, techniciansResult, baysResult] = results;
    const userId = currentUserId();
    if (membershipResult.status === "fulfilled") {
      setMemberships(membershipResult.value);
      const self = membershipResult.value.find((item) => item.userId === userId && item.isActive);
      setCanConfigure(self?.role === "owner" || self?.role === "manager");
      setIsOwner(self?.role === "owner");
    } else {
      setMemberships([]);
      setCanConfigure(false);
      setIsOwner(false);
    }
    if (hoursResult.status === "fulfilled") setHours(hoursResult.value);
    else setError(messageOf(hoursResult.reason));
    if (closuresResult.status === "fulfilled") setClosures(closuresResult.value);
    if (offeringsResult.status === "fulfilled") setOfferings(offeringsResult.value);
    if (servicesResult.status === "fulfilled") setServiceTypes(servicesResult.value);
    if (techniciansResult.status === "fulfilled") setTechnicians(techniciansResult.value);
    if (baysResult.status === "fulfilled") setBays(baysResult.value);
    setLoading(false);
  }

  const refreshSetup = useEffectEvent(() => { void loadSetup(); });
  // The effect synchronizes persisted setup data with the selected dealership.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { refreshSetup(); }, [dealership?.id]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setLoading(true);
      await loadSetup();
      setSuccess(message);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function saveDealership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dealership) {
      await runAction(() => api.updateDealership(dealership.id, dealershipForm), "Dealership details saved.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.createDealership(dealershipForm);
      onDealershipCreated(created);
      setDealershipForm({ name: "", addressLine1: "", city: "", region: "", postalCode: "", countryCode: "US", timezone: "America/Los_Angeles" });
      setSuccess("Dealership created. You are its owner.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    const body = hourForm.isClosed
      ? { dayOfWeek: Number(hourForm.dayOfWeek), isClosed: true, openTime: null, closeTime: null }
      : { dayOfWeek: Number(hourForm.dayOfWeek), isClosed: false, openTime: hourForm.openTime, closeTime: hourForm.closeTime };
    const existing = hours.find((item) => item.dayOfWeek === Number(hourForm.dayOfWeek));
    await runAction(() => existing
      ? api.updateHours(dealership.id, existing.id, body)
      : api.createHours(dealership.id, body), "Weekly hours saved.");
  }

  async function saveClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    const body = {
      startsAt: dateTimeLocalToIso(closureForm.startsAt, dealership.timezone),
      endsAt: dateTimeLocalToIso(closureForm.endsAt, dealership.timezone),
      reason: closureForm.reason || undefined,
    };
    await runAction(() => closureEditId
      ? api.updateClosure(dealership.id, closureEditId, body)
      : api.createClosure(dealership.id, body), closureEditId ? "Closure period updated." : "Closure period added.");
    setClosureForm({ startsAt: "", endsAt: "", reason: "" });
    setClosureEditId("");
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    setBusy(true);
    setError("");
    try {
      const serviceTypeId = serviceFormMode === "existing"
        ? existingServiceTypeId
        : (await api.createServiceType({ name: serviceForm.name, description: serviceForm.description || undefined })).id;
      await api.createOffering(dealership.id, { serviceTypeId, durationMinutes: Number(serviceForm.durationMinutes) });
      await loadSetup();
      setServiceForm({ name: "", description: "", durationMinutes: "60" });
      setExistingServiceTypeId("");
      setSuccess("Service type and dealership offering created.");
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function saveDuration(offering: ServiceOffering) {
    if (!dealership) return;
    const durationMinutes = Number(durationDrafts[offering.id] ?? offering.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setError("Service duration must be between 1 and 1440 minutes.");
      return;
    }
    await runAction(() => api.updateOffering(dealership.id, offering.id, { durationMinutes }), "Service duration updated.");
  }

  async function saveServiceTypeName(service: ServiceType) {
    const name = (serviceNameDrafts[service.id] ?? service.name).trim();
    if (!name) {
      setError("Service name cannot be empty.");
      return;
    }
    await runAction(() => api.updateServiceType(service.id, { name }), "Service catalog updated.");
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    await runAction(() => api.provisionStaff({ ...staffForm, dealershipId: dealership.id }), "Staff account provisioned.");
    setStaffForm({ email: "", password: "", role: "staff" });
  }

  async function createTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    await runAction(() => api.createTechnician(dealership.id, technicianForm), "Technician created.");
    setTechnicianForm({ displayName: "", employeeCode: "" });
  }

  async function selectTechnician(id: string) {
    setSelectedTechnician(id);
    if (!dealership || !id) return;
    const technician = technicians.find((item) => item.id === id);
    if (technician) setTechnicianEdit({ displayName: technician.displayName, employeeCode: technician.employeeCode ?? "" });
    const results = await Promise.allSettled([
      api.getQualifications(dealership.id, id), api.getShifts(dealership.id, id), api.getLeaves(dealership.id, id),
    ]);
    if (results[0].status === "fulfilled") setQualifications(results[0].value);
    if (results[1].status === "fulfilled") setShifts(results[1].value);
    if (results[2].status === "fulfilled") setLeaves(results[2].value);
  }

  async function saveTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership || !selectedTechnician) return;
    await runAction(() => api.updateTechnician(dealership.id, selectedTechnician, technicianEdit), "Technician details updated.");
  }

  async function addQualification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership || !selectedTechnician) return;
    const validity = {
      ...(qualificationForm.validFrom ? { validFrom: dateTimeLocalToIso(`${qualificationForm.validFrom}T00:00`, dealership.timezone) } : {}),
      ...(qualificationForm.validTo ? { validTo: dateTimeLocalToIso(`${qualificationForm.validTo}T00:00`, dealership.timezone) } : {}),
    };
    await runAction(() => qualificationEditId
      ? api.updateQualification(dealership.id, selectedTechnician, qualificationEditId, validity)
      : api.createQualification(dealership.id, selectedTechnician, { serviceTypeId: qualificationForm.serviceTypeId, ...validity }), qualificationEditId ? "Qualification updated." : "Qualification added.");
    setQualificationEditId("");
    setQualificationForm({ serviceTypeId: "", validFrom: "", validTo: "" });
    await selectTechnician(selectedTechnician);
  }

  async function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership || !selectedTechnician) return;
    await runAction(() => shiftEditId
      ? api.updateShift(dealership.id, selectedTechnician, shiftEditId, { ...shiftForm, dayOfWeek: Number(shiftForm.dayOfWeek) })
      : api.createShift(dealership.id, selectedTechnician, { ...shiftForm, dayOfWeek: Number(shiftForm.dayOfWeek) }), shiftEditId ? "Technician shift updated." : "Technician shift added.");
    setShiftEditId("");
    setShiftForm({ dayOfWeek: "1", startLocalTime: "08:00:00", endLocalTime: "17:00:00" });
    await selectTechnician(selectedTechnician);
  }

  async function toggleShift(shift: TechnicianShift) {
    if (!dealership || !selectedTechnician) return;
    await runAction(() => api.updateShift(dealership.id, selectedTechnician, shift.id, { isActive: !shift.isActive }), "Shift updated.");
    await selectTechnician(selectedTechnician);
  }

  async function addLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership || !selectedTechnician) return;
    const body = {
      startsAt: dateTimeLocalToIso(leaveForm.startsAt, dealership.timezone),
      endsAt: dateTimeLocalToIso(leaveForm.endsAt, dealership.timezone),
      reason: leaveForm.reason || undefined,
    };
    await runAction(() => leaveEditId
      ? api.updateLeave(dealership.id, selectedTechnician, leaveEditId, body)
      : api.createLeave(dealership.id, selectedTechnician, body), leaveEditId ? "Leave period updated." : "Leave period added.");
    setLeaveForm({ startsAt: "", endsAt: "", reason: "" });
    setLeaveEditId("");
    await selectTechnician(selectedTechnician);
  }

  async function createBay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    await runAction(() => api.createBay(dealership.id, bayForm), "Service bay created.");
    setBayForm({ bayCode: "" });
  }

  async function addCapability(event: FormEvent<HTMLFormElement>, bayId: string) {
    event.preventDefault();
    if (!dealership) return;
    const serviceTypeId = capabilityChoice[bayId];
    if (!serviceTypeId) return;
    await runAction(() => api.createBayCapability(dealership.id, bayId, serviceTypeId), "Bay capability added.");
    await loadCapabilities(bayId);
  }

  async function loadCapabilities(bayId: string) {
    if (!dealership) return;
    try {
      const rows = await api.getBayCapabilities(dealership.id, bayId);
      setCapabilities((current) => ({ ...current, [bayId]: rows }));
    } catch (caught) { setError(messageOf(caught)); }
  }

  async function toggleBay(bay: ServiceBay) {
    if (!dealership) return;
    await runAction(() => api.updateBay(dealership.id, bay.id, { isActive: !bay.isActive }), "Bay status updated.");
  }

  async function saveBayCode(bay: ServiceBay) {
    if (!dealership) return;
    const bayCode = (bayCodeDrafts[bay.id] ?? bay.bayCode).trim();
    if (!bayCode) {
      setError("Bay code cannot be empty.");
      return;
    }
    await runAction(() => api.updateBay(dealership.id, bay.id, { bayCode }), "Bay code updated.");
  }

  if (!dealership) {
    return (
      <section className="setup-workspace">
        <SectionHeading eyebrow="GET STARTED" title="Create a dealership" />
        {error && <Notice>{error}</Notice>}
        <Card>
          <div className="card-title-row"><span className="round-icon"><Building2 size={18} /></span><div><strong>Dealership details</strong><small>You’ll be assigned the initial owner role.</small></div></div>
          <DealershipForm form={dealershipForm} setForm={setDealershipForm} onSubmit={(event) => void saveDealership(event)} busy={busy} submitLabel="Create dealership" />
        </Card>
      </section>
    );
  }

  return (
    <section className="setup-workspace">
      <SectionHeading eyebrow="DEALERSHIP SETTINGS" title="Operations setup" />
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {!canConfigure && <Notice tone="info">Setup changes require an owner or manager membership. Your API permissions remain authoritative.</Notice>}
      <nav className="setup-tabs" aria-label="Dealership setup sections">
        {(["overview", "hours", "services", "team", "bays"] as SetupTab[]).map((item) => {
          const labels: Record<SetupTab, string> = { overview: "Details", hours: "Hours", services: "Services", team: "Team", bays: "Bays" };
          return <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{labels[item]}</button>;
        })}
      </nav>
      {loading && <Spinner label="Loading configuration" />}

      {tab === "overview" && (
        <>
          <Card>
            <div className="card-title-row"><span className="round-icon"><Building2 size={18} /></span><div><strong>Business details</strong><small>{dealership.timezone}</small></div></div>
            <DealershipForm form={dealershipForm} setForm={setDealershipForm} onSubmit={(event) => void saveDealership(event)} busy={busy || !canConfigure} submitLabel="Save details" />
          </Card>
          <Card>
            <div className="card-title-row"><span className="round-icon"><ShieldCheck size={18} /></span><div><strong>Team access</strong><small>{memberships.filter((item) => item.isActive).length} active member(s)</small></div></div>
            {memberships.filter((item) => item.isActive).map((membership) => <div className="membership-row" key={membership.id}><span className="avatar-initials">{membership.role.slice(0, 1).toUpperCase()}</span><code>{membership.userId}</code><span className="quiet-chip">{membership.role}</span></div>)}
            {canConfigure && (
              <form className="stack-form compact-form provision-form" onSubmit={(event) => void createStaff(event)}>
                <p className="eyebrow"><UserPlus size={13} /> PROVISION A STAFF LOGIN</p>
                <Field label="Email"><Input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></Field>
                <Field label="Temporary password" hint="At least 12 characters."><Input required minLength={12} type="password" value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></Field>
                <Field label="Role"><Select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}>{isOwner && <><option value="manager">Manager</option><option value="owner">Owner</option></>}<option value="staff">Staff</option></Select></Field>
                <Button type="submit" disabled={busy}>Create staff account <Plus size={15} /></Button>
              </form>
            )}
          </Card>
        </>
      )}

      {tab === "hours" && (
        <>
          <Card>
            <div className="card-title-row"><span className="round-icon"><Clock3 size={18} /></span><div><strong>Weekly opening hours</strong><small>Times use the dealership timezone.</small></div></div>
            <div className="hours-list">{weekdays.map((day, index) => {
              const saved = hours.find((item) => item.dayOfWeek === index);
              return <button type="button" className="hours-row" key={day} disabled={!canConfigure || !saved} onClick={() => saved && setHourForm({ dayOfWeek: String(saved.dayOfWeek), openTime: saved.openTime ?? "08:00:00", closeTime: saved.closeTime ?? "17:00:00", isClosed: saved.isClosed })}>
                <span>{day}</span><strong>{saved ? saved.isClosed ? "Closed" : `${saved.openTime?.slice(0, 5)} – ${saved.closeTime?.slice(0, 5)}` : "Not configured"}</strong>
              </button>;
            })}</div>
            <form className="stack-form compact-form" onSubmit={(event) => void saveHours(event)}>
              <Field label="Edit day"><Select value={hourForm.dayOfWeek} onChange={(event) => setHourForm({ ...hourForm, dayOfWeek: event.target.value })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field>
              <label className="check-field"><input type="checkbox" checked={hourForm.isClosed} onChange={(event) => setHourForm({ ...hourForm, isClosed: event.target.checked })} /> Closed all day</label>
              {!hourForm.isClosed && <div className="form-grid-two"><Field label="Open"><Input required type="time" value={hourForm.openTime.slice(0, 5)} onChange={(event) => setHourForm({ ...hourForm, openTime: `${event.target.value}:00` })} /></Field><Field label="Close"><Input required type="time" value={hourForm.closeTime.slice(0, 5)} onChange={(event) => setHourForm({ ...hourForm, closeTime: `${event.target.value}:00` })} /></Field></div>}
              <Button type="submit" variant="secondary" disabled={busy || !canConfigure}>Save this day</Button>
            </form>
          </Card>
          <Card>
            <div className="card-title-row"><span className="round-icon"><CalendarClock size={18} /></span><div><strong>Dated closures</strong><small>Holiday or one-off closure windows</small></div></div>
            {closures.map((closure) => <div className="closure-row" key={closure.id}><span><strong>{String(closure.reason || "Closure")}</strong><small>{formatInTimezone(String(closure.startsAt), dealership.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} to {formatInTimezone(String(closure.endsAt), dealership.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span><Button variant="quiet" size="small" disabled={!canConfigure || busy} onClick={() => { setClosureEditId(closure.id); setClosureForm({ startsAt: instantToDateTimeLocal(String(closure.startsAt), dealership.timezone), endsAt: instantToDateTimeLocal(String(closure.endsAt), dealership.timezone), reason: String(closure.reason ?? "") }); }}>Edit</Button><Button variant="quiet" size="icon" title="Delete closure" aria-label="Delete closure" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.deleteClosure(dealership.id, closure.id), "Closure removed.")}><Trash2 size={16} /></Button></div>)}
            {!closures.length && <p className="field-hint">No dated closures recorded.</p>}
            <form className="stack-form compact-form" onSubmit={(event) => void saveClosure(event)}>
              <p className="eyebrow">{closureEditId ? "EDIT CLOSURE WINDOW" : "ADD CLOSURE WINDOW"}</p>
              <Field label="Starts"><Input required type="datetime-local" value={closureForm.startsAt} onChange={(event) => setClosureForm({ ...closureForm, startsAt: event.target.value })} /></Field>
              <Field label="Ends"><Input required type="datetime-local" value={closureForm.endsAt} onChange={(event) => setClosureForm({ ...closureForm, endsAt: event.target.value })} /></Field>
              <Field label="Reason"><Input value={closureForm.reason} onChange={(event) => setClosureForm({ ...closureForm, reason: event.target.value })} /></Field>
              <Button type="submit" variant="secondary" disabled={busy || !canConfigure}>{closureEditId ? "Save closure" : "Add closure"}</Button>
            </form>
          </Card>
        </>
      )}

      {tab === "services" && (
        <>
          <Card>
            <div className="card-title-row"><span className="round-icon"><Cog size={18} /></span><div><strong>Offerings</strong><small>Service durations at this location</small></div></div>
            {offerings.map((offering) => <div className="offering-row" key={offering.id}><span><strong>{serviceTypes.find((service) => service.id === offering.serviceTypeId)?.name ?? offering.serviceName ?? "Service"}</strong><small>{offering.isActive ? "Active" : "Inactive"}</small></span><Field label="Minutes"><Input className="duration-input" type="number" min="1" max="1440" value={durationDrafts[offering.id] ?? String(offering.durationMinutes)} onChange={(event) => setDurationDrafts({ ...durationDrafts, [offering.id]: event.target.value })} disabled={!canConfigure} /></Field><Button size="small" variant="secondary" disabled={!canConfigure || busy} onClick={() => void saveDuration(offering)}>Save</Button><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.updateOffering(dealership.id, offering.id, { isActive: !offering.isActive }), "Offering status updated.")}>{offering.isActive ? "Deactivate" : "Activate"}</Button></div>)}
            {!offerings.length && <EmptyState title="No services offered" detail="Create a service and set its duration below." />}
            {canConfigure && <form className="stack-form compact-form" onSubmit={(event) => void saveService(event)}>
              <p className="eyebrow">CREATE SERVICE OFFERING</p>
              <div className="segmented"><button type="button" className={serviceFormMode === "new" ? "selected" : ""} onClick={() => setServiceFormMode("new")}>New catalog item</button><button type="button" className={serviceFormMode === "existing" ? "selected" : ""} onClick={() => setServiceFormMode("existing")}>Existing item</button></div>
              {serviceFormMode === "new" ? <><Field label="Service name"><Input required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></Field><Field label="Description"><Input value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} /></Field></> : <Field label="Catalog service"><Select required value={existingServiceTypeId} onChange={(event) => setExistingServiceTypeId(event.target.value)}><option value="">Choose an existing service</option>{serviceTypes.filter((service) => service.isActive !== false && !offerings.some((offering) => offering.serviceTypeId === service.id)).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select></Field>}
              <Field label="Duration (minutes)"><Input required type="number" min="1" max="1440" value={serviceForm.durationMinutes} onChange={(event) => setServiceForm({ ...serviceForm, durationMinutes: event.target.value })} /></Field>
              <Button type="submit" disabled={busy}>Add offering <Plus size={15} /></Button>
            </form>}
            <h3 className="subsection-title">Shared service catalog</h3>
            {serviceTypes.map((service) => <div className="catalog-row" key={service.id}><Input aria-label={`${service.name} service name`} value={serviceNameDrafts[service.id] ?? service.name} onChange={(event) => setServiceNameDrafts({ ...serviceNameDrafts, [service.id]: event.target.value })} disabled={!canConfigure} /><Button size="small" variant="secondary" disabled={!canConfigure || busy} onClick={() => void saveServiceTypeName(service)}>Save</Button><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.updateServiceType(service.id, { isActive: service.isActive === false }), "Service status updated.")}>{service.isActive === false ? "Reactivate" : "Deactivate"}</Button></div>)}
          </Card>
        </>
      )}

      {tab === "team" && (
        <>
          <Card>
            <div className="card-title-row"><span className="round-icon"><Wrench size={18} /></span><div><strong>Technicians</strong><small>Qualifications, weekly shifts, and leave</small></div></div>
            {technicians.map((tech) => <div role="button" tabIndex={0} className={selectedTechnician === tech.id ? "resource-row selected" : "resource-row"} key={tech.id} onClick={() => void selectTechnician(tech.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void selectTechnician(tech.id); }}><span className="resource-avatar">{tech.displayName.slice(0, 1)}</span><span><strong>{tech.displayName}</strong><small>{tech.employeeCode || "No employee code"} · {tech.isActive ? "Active" : "Inactive"}</small></span><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.updateTechnician(dealership.id, tech.id, { isActive: !tech.isActive }), "Technician status updated.")}>{tech.isActive ? "Deactivate" : "Reactivate"}</Button></div>)}
            {!technicians.length && <EmptyState title="No technicians" detail="Add a technician to configure qualifications and shifts." />}
            {canConfigure && <form className="inline-form" onSubmit={(event) => void createTechnician(event)}><Input required placeholder="Technician name" value={technicianForm.displayName} onChange={(event) => setTechnicianForm({ ...technicianForm, displayName: event.target.value })} /><Input placeholder="Code" value={technicianForm.employeeCode} onChange={(event) => setTechnicianForm({ ...technicianForm, employeeCode: event.target.value })} /><Button type="submit" size="small" disabled={busy} aria-label="Add technician"><Plus size={17} /></Button></form>}
          </Card>
          {selectedTechnician && (
            <Card>
              <SectionHeading eyebrow="TECHNICIAN DETAILS" title={technicians.find((item) => item.id === selectedTechnician)?.displayName ?? "Technician"} />
              {canConfigure && <form className="stack-form compact-form" onSubmit={(event) => void saveTechnician(event)}><div className="form-grid-two"><Field label="Display name"><Input required value={technicianEdit.displayName} onChange={(event) => setTechnicianEdit({ ...technicianEdit, displayName: event.target.value })} /></Field><Field label="Employee code"><Input value={technicianEdit.employeeCode} onChange={(event) => setTechnicianEdit({ ...technicianEdit, employeeCode: event.target.value })} /></Field></div><Button type="submit" variant="secondary" size="small" disabled={busy}>Save technician</Button></form>}
              <h3 className="subsection-title">Qualifications</h3>
              {qualifications.map((qualification) => <div className="compact-row" key={qualification.id ?? `${qualification.technicianId}-${qualification.serviceTypeId}`}><span>{serviceTypes.find((service) => service.id === qualification.serviceTypeId)?.name ?? String(qualification.serviceTypeId)}<small>{qualification.validFrom ? `From ${formatInTimezone(String(qualification.validFrom), dealership.timezone, { month: "short", day: "numeric", year: "numeric" })}` : "No start date"}</small></span><Button size="small" variant="quiet" disabled={!canConfigure} onClick={() => { setQualificationEditId(String(qualification.serviceTypeId)); setQualificationForm({ serviceTypeId: String(qualification.serviceTypeId), validFrom: qualification.validFrom ? instantToDateTimeLocal(String(qualification.validFrom), dealership.timezone).slice(0, 10) : "", validTo: qualification.validTo ? instantToDateTimeLocal(String(qualification.validTo), dealership.timezone).slice(0, 10) : "" }); }}>Edit</Button><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.deleteQualification(dealership.id, selectedTechnician, String(qualification.serviceTypeId)), "Qualification removed.")}>Remove</Button></div>)}
              {canConfigure && <form className="inline-form" onSubmit={(event) => void addQualification(event)}><Select required value={qualificationForm.serviceTypeId} disabled={Boolean(qualificationEditId)} onChange={(event) => setQualificationForm({ ...qualificationForm, serviceTypeId: event.target.value })}><option value="">{qualificationEditId ? "Editing qualification" : "Add qualification"}</option>{serviceTypes.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select><Input aria-label="Valid from" type="date" value={qualificationForm.validFrom} onChange={(event) => setQualificationForm({ ...qualificationForm, validFrom: event.target.value })} /><Input aria-label="Valid to" type="date" value={qualificationForm.validTo} onChange={(event) => setQualificationForm({ ...qualificationForm, validTo: event.target.value })} /><Button size="small" type="submit" aria-label="Save qualification" disabled={busy}><Plus size={16} /></Button></form>}
              <h3 className="subsection-title">Weekly shifts</h3>
              {shifts.map((shift) => <div className="compact-row" key={shift.id}><span>{weekdays[shift.dayOfWeek]} · {shift.startLocalTime.slice(0, 5)}–{shift.endLocalTime.slice(0, 5)}<small>{shift.isActive ? "Active" : "Inactive"}</small></span><Button size="small" variant="quiet" disabled={!canConfigure} onClick={() => { setShiftEditId(shift.id); setShiftForm({ dayOfWeek: String(shift.dayOfWeek), startLocalTime: shift.startLocalTime, endLocalTime: shift.endLocalTime }); }}>Edit</Button><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void toggleShift(shift)}>{shift.isActive ? "Pause" : "Enable"}</Button></div>)}
              {canConfigure && <form className="inline-form" onSubmit={(event) => void addShift(event)}><Select value={shiftForm.dayOfWeek} onChange={(event) => setShiftForm({ ...shiftForm, dayOfWeek: event.target.value })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select><Input type="time" required value={shiftForm.startLocalTime.slice(0, 5)} onChange={(event) => setShiftForm({ ...shiftForm, startLocalTime: `${event.target.value}:00` })} /><Input type="time" required value={shiftForm.endLocalTime.slice(0, 5)} onChange={(event) => setShiftForm({ ...shiftForm, endLocalTime: `${event.target.value}:00` })} /><Button size="small" type="submit" aria-label="Save shift">{shiftEditId ? "Save" : <Plus size={16} />}</Button></form>}
              <h3 className="subsection-title">Dated leave</h3>
              {leaves.map((leave) => <div className="compact-row" key={leave.id}><span>{formatInTimezone(leave.startsAt, dealership.timezone, { month: "short", day: "numeric" })} – {formatInTimezone(leave.endsAt, dealership.timezone, { month: "short", day: "numeric" })}<small>{leave.reason || "Unavailable"}</small></span><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => { setLeaveEditId(leave.id); setLeaveForm({ startsAt: instantToDateTimeLocal(leave.startsAt, dealership.timezone), endsAt: instantToDateTimeLocal(leave.endsAt, dealership.timezone), reason: leave.reason ?? "" }); }}>Edit</Button><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void runAction(() => api.deleteLeave(dealership.id, selectedTechnician, leave.id), "Leave removed.")}>Remove</Button></div>)}
              {canConfigure && <form className="stack-form compact-form" onSubmit={(event) => void addLeave(event)}><div className="form-grid-two"><Field label="Starts"><Input type="datetime-local" required value={leaveForm.startsAt} onChange={(event) => setLeaveForm({ ...leaveForm, startsAt: event.target.value })} /></Field><Field label="Ends"><Input type="datetime-local" required value={leaveForm.endsAt} onChange={(event) => setLeaveForm({ ...leaveForm, endsAt: event.target.value })} /></Field></div><Field label="Reason"><Input value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} /></Field><Button type="submit" variant="secondary">{leaveEditId ? "Save leave" : "Add leave"}</Button></form>}
            </Card>
          )}
        </>
      )}

      {tab === "bays" && (
        <>
          <Card>
            <div className="card-title-row"><span className="round-icon"><Wrench size={18} /></span><div><strong>Service bays</strong><small>Compatibility controls booking capacity</small></div></div>
            {bays.map((bay) => <div className="bay-card" key={bay.id}>
              <div className="resource-row"><span className="resource-avatar">B</span><span><strong>{bay.bayCode}</strong><small>{bay.isActive ? "Active" : "Inactive"}</small></span><Button size="small" variant="quiet" disabled={!canConfigure || busy} onClick={() => void toggleBay(bay)}>{bay.isActive ? "Deactivate" : "Reactivate"}</Button></div>
              {canConfigure && <div className="inline-form"><Input aria-label={`Bay code for ${bay.bayCode}`} value={bayCodeDrafts[bay.id] ?? bay.bayCode} onChange={(event) => setBayCodeDrafts({ ...bayCodeDrafts, [bay.id]: event.target.value })} /><Button size="small" variant="secondary" disabled={busy} onClick={() => void saveBayCode(bay)}>Save code</Button></div>}
              <div className="chip-list">{(capabilities[bay.id] ?? []).map((capability) => <span className="quiet-chip" key={capability.serviceTypeId}>{capability.serviceName ?? serviceTypes.find((item) => item.id === capability.serviceTypeId)?.name ?? "Service"}<button type="button" aria-label={`Remove ${capability.serviceName ?? "service"} capability`} disabled={!canConfigure} onClick={() => void runAction(() => api.deleteBayCapability(dealership.id, bay.id, capability.serviceTypeId), "Bay capability removed.")}>×</button></span>)}<Button variant="quiet" size="small" onClick={() => void loadCapabilities(bay.id)}>Refresh</Button></div>
              {canConfigure && <form className="inline-form" onSubmit={(event) => void addCapability(event, bay.id)}><Select required value={capabilityChoice[bay.id] ?? ""} onChange={(event) => setCapabilityChoice({ ...capabilityChoice, [bay.id]: event.target.value })}><option value="">Add a service capability</option>{serviceTypes.filter((service) => !(capabilities[bay.id] ?? []).some((item) => item.serviceTypeId === service.id)).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select><Button size="small" type="submit" aria-label="Add capability"><Plus size={16} /></Button></form>}
            </div>)}
            {!bays.length && <EmptyState title="No bays configured" detail="Add bays and compatible services." />}
            {canConfigure && <form className="inline-form" onSubmit={(event) => void createBay(event)}><Input required placeholder="Bay code, e.g. BAY-01" value={bayForm.bayCode} onChange={(event) => setBayForm({ bayCode: event.target.value })} /><Button size="small" type="submit" disabled={busy} aria-label="Add service bay"><Plus size={17} /></Button></form>}
          </Card>
        </>
      )}
    </section>
  );
}

function DealershipForm({
  form,
  setForm,
  onSubmit,
  busy,
  submitLabel,
}: {
  form: DealershipFormValues;
  setForm: (form: DealershipFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  submitLabel: string;
}) {
  return (
    <form className="stack-form compact-form" onSubmit={onSubmit}>
      <Field label="Dealership name"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} /></Field>
      <Field label="Street address"><Input required value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} disabled={busy} /></Field>
      <div className="form-grid-two"><Field label="City"><Input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} disabled={busy} /></Field><Field label="Region"><Input required value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} disabled={busy} /></Field></div>
      <div className="form-grid-two"><Field label="Postal code"><Input required value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} disabled={busy} /></Field><Field label="Country code"><Input required maxLength={2} value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value.toUpperCase() })} disabled={busy} /></Field></div>
      <Field label="IANA timezone" hint="Example: America/Los_Angeles"><Input required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} disabled={busy} /></Field>
      <Button type="submit" disabled={busy}>{submitLabel}<Check size={15} /></Button>
    </form>
  );
}

function messageOf(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "Request failed. Try again.";
}
