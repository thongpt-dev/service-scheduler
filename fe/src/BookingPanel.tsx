import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, MapPin, Wrench } from "lucide-react";
import { ApiError, api, type AvailabilityResult, type Customer, type Dealership, type ServiceOffering, type ServiceType, type Vehicle } from "./api";
import { formatInTimezone } from "./date-time";
import { Button, Card, EmptyState, Field, Input, Notice, Select, Spinner } from "./components/ui";

function localDate(offsetDays = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BookingPanel({
  mode,
  dealershipId,
  customers = [],
  onBooked,
}: {
  mode: "customer" | "staff";
  dealershipId?: string;
  customers?: Customer[];
  onBooked?: () => void;
}) {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [selectedDealership, setSelectedDealership] = useState(dealershipId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [date, setDate] = useState(localDate(2));
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<Awaited<ReturnType<typeof api.book>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const dealerRequest = mode === "customer"
          ? api.getDealerships()
          : dealershipId
            ? api.getDealership(dealershipId).then((item) => [item])
            : Promise.resolve([]);
        const [activeDealerships, types, customerVehicles, profile] = await Promise.all([
          dealerRequest,
          api.getServiceTypes(),
          mode === "customer" ? api.getMyVehicles() : Promise.resolve([]),
          mode === "customer" ? api.getMyProfile() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setDealerships(activeDealerships);
        setServiceTypes(types);
        setVehicles(customerVehicles);
        setCustomerId(profile?.id ?? "");
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [dealershipId, mode]);

  useEffect(() => {
    if (mode === "staff" && !dealershipId) return;
    const currentDealershipId = mode === "staff" ? dealershipId : selectedDealership || dealerships[0]?.id || "";
    if (!currentDealershipId) return;
    void api.getOfferings(currentDealershipId)
      .then(setOfferings)
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [dealershipId, dealerships, mode, selectedDealership]);

  useEffect(() => {
    if (mode !== "staff" || !dealershipId || !customerId) return;
    void api.getCustomerVehicles(dealershipId, customerId)
      .then(setVehicles)
      .catch((caught: unknown) => {
        setVehicles([]);
        setError(errorMessage(caught));
      });
  }, [customerId, dealershipId, mode]);

  const selectedOffering = offerings.find((offering) => offering.serviceTypeId === serviceTypeId);
  const selectedService = serviceTypes.find((service) => service.id === serviceTypeId);
  const activeDealershipId = mode === "staff" ? dealershipId ?? "" : selectedDealership || dealerships[0]?.id || "";
  const selectedDealer = dealerships.find((item) => item.id === activeDealershipId);
  const compatibleVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.isActive !== false), [vehicles]);

  async function findTimes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setAvailability(null);
    setSelectedStart("");
    setConfirmed(null);
    try {
      const selectedVehicleRecord = vehicles.find((vehicle) => vehicle.id === selectedVehicle);
      if (
        mode === "customer" &&
        selectedVehicleRecord?.ownerCustomerId === customerId
      ) {
        await api.assignVehicle(selectedVehicle, activeDealershipId);
      }
      const result = await api.availability({
        dealershipId: activeDealershipId,
        vehicleId: selectedVehicle,
        serviceTypeId,
        date,
        ...(mode === "staff" ? { customerId } : {}),
      });
      setAvailability(result);
      if (result.slots.length === 0) setError("No suitable times were found. Try another date.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    const slot = availability?.slots.find((item) => item.startsAt === selectedStart);
    if (!slot) return;
    setSaving(true);
    setError("");
    try {
      const appointment = await api.book({
        dealershipId: activeDealershipId,
        vehicleId: selectedVehicle,
        serviceTypeId,
        startsAt: slot.startsAt,
        ...(mode === "staff" ? { customerId } : {}),
      }, mode === "staff");
      setConfirmed(appointment);
      setAvailability(null);
      setSelectedStart("");
      onBooked?.();
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiError && caught.status === 409) {
        setAvailability(null);
      }
    } finally {
      setSaving(false);
    }
  }

  if (confirmed) {
    return (
      <div className="booking-success">
        <div className="success-icon"><Check size={24} /></div>
        <p className="eyebrow">BOOKING CONFIRMED</p>
        <h2>You're all set.</h2>
        <p className="muted-copy">{confirmed.appointmentRef}</p>
        <Card className="confirmation-card">
          <div className="confirmation-row"><CalendarDays size={17} /><span>{formatInTimezone(confirmed.startsAt, selectedDealer?.timezone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
          <div className="confirmation-row"><MapPin size={17} /><span>{selectedDealer?.name ?? "Dealership service"}</span></div>
          <div className="confirmation-row"><Wrench size={17} /><span>{confirmed.serviceNameSnapshot}</span></div>
          <p className="confirmation-ref">Reference <strong>{confirmed.appointmentRef}</strong></p>
        </Card>
        <Button variant="secondary" onClick={() => { setConfirmed(null); setAvailability(null); setError(""); }}>Book another service</Button>
      </div>
    );
  }

  return (
    <div className="booking-flow">
      <div className="booking-steps" aria-label="Booking steps">
        <span className="step-current">01 <i>Details</i></span>
        <span className={availability ? "step-current" : ""}>02 <i>Time</i></span>
        <span className={selectedStart ? "step-current" : ""}>03 <i>Confirm</i></span>
      </div>
      <form onSubmit={findTimes} className="stack-form">
        {mode === "customer" ? (
          <Field label="Dealership">
            <Select required value={activeDealershipId} onChange={(event) => { setSelectedDealership(event.target.value); setServiceTypeId(""); setAvailability(null); setSelectedStart(""); }}>
              <option value="">Choose a dealership</option>
              {dealerships.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.city}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Customer">
            <Select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setSelectedVehicle(""); setVehicles([]); }}>
              <option value="">Choose a dealership customer</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.firstName} {customer.lastName} · {customer.email}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Vehicle">
          <Select required value={selectedVehicle} onChange={(event) => setSelectedVehicle(event.target.value)} disabled={mode === "staff" && !customerId}>
            <option value="">Choose a vehicle</option>
            {compatibleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.vin}</option>)}
          </Select>
          {mode === "customer" && vehicles.length === 0 && <span className="field-hint">Add a vehicle in Garage before booking.</span>}
        </Field>
        <Field label="Service">
          <Select required value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)} disabled={!selectedDealership}>
            <option value="">Choose a service</option>
            {offerings.filter((offering) => offering.isActive).map((offering) => {
              const type = serviceTypes.find((item) => item.id === offering.serviceTypeId);
              return <option key={offering.serviceTypeId} value={offering.serviceTypeId}>{type?.name ?? offering.serviceName ?? "Service"} · {offering.durationMinutes} min</option>;
            })}
          </Select>
        </Field>
        <Field label="Preferred date">
          <Input required type="date" min={localDate()} max={localDate(60)} value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        {selectedOffering && <p className="duration-note"><Clock3 size={15} /> Estimated service time: {selectedOffering.durationMinutes} minutes</p>}
        {error && <Notice>{error}</Notice>}
          <Button type="submit" disabled={loading || !activeDealershipId || !selectedVehicle || !serviceTypeId}>
          {loading ? "Finding times…" : "Find available times"}<ArrowRight size={17} />
        </Button>
      </form>

      {loading && <Spinner label="Checking schedules" />}
      {availability && (
        <section className="slot-results">
          <div className="slot-heading">
            <div><p className="eyebrow">AVAILABLE TIMES</p><h3>{new Date(`${availability.date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3></div>
            <span className="timezone-tag">{availability.timezone}</span>
          </div>
          {availability.slots.length ? (
            <div className="slot-grid">
              {availability.slots.map((slot) => (
                <button key={slot.startsAt} type="button" className={selectedStart === slot.startsAt ? "slot-button selected" : "slot-button"} onClick={() => setSelectedStart(slot.startsAt)}>
                  {slot.localStartTime}<small>{slot.utcOffset}</small>
                </button>
              ))}
            </div>
          ) : <EmptyState title="No open times" detail="Try another date or service." />}
          {selectedStart && (
            <div className="confirm-row">
              <span>{selectedService?.name ?? "Service"}<small>{availability.durationMinutes} min</small></span>
              <Button onClick={() => void confirmBooking()} disabled={saving}>{saving ? "Confirming…" : "Confirm booking"}<Check size={16} /></Button>
            </div>
          )}
          <button className="text-button slot-back" type="button" onClick={() => { setAvailability(null); setSelectedStart(""); }}><ArrowLeft size={15} /> Change details</button>
        </section>
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
