import { useState, type FormEvent } from "react";
import { ArrowRight, Building2, CalendarDays, CarFront, KeyRound, Wrench } from "lucide-react";
import { ApiError, api } from "./api";
import { Button, Field, Input, Notice } from "./components/ui";

export type Workspace = "customer" | "dealership";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (token: string, workspace: Workspace) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace>("customer");
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = registering
        ? await api.registerCustomer({
            email: form.email,
            password: form.password,
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone || undefined,
          })
        : workspace === "customer"
          ? await api.customerLogin({ email: form.email, password: form.password })
          : await api.staffLogin({ email: form.email, password: form.password });
      onAuthenticated(result.accessToken, registering ? "customer" : workspace);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Sign in could not be completed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="brand-lockup" href="#top" aria-label="Service Lane home">
          <span className="brand-icon"><Wrench size={19} strokeWidth={2.2} /></span>
          <span>service<span className="brand-accent">lane</span></span>
        </a>
        <div className="auth-intro" id="top">
          <p className="eyebrow">SERVICE SCHEDULER</p>
          <h1>{registering ? "Make room for better service." : "Your next service, sorted."}</h1>
          <p className="auth-copy">A clearer way to book and manage dealership service.</p>
        </div>

        <div className="workspace-switch" role="tablist" aria-label="Sign in as">
          <button
            type="button"
            className={workspace === "customer" ? "workspace-option active" : "workspace-option"}
            onClick={() => { setWorkspace("customer"); setRegistering(false); setError(""); }}
            role="tab"
            aria-selected={workspace === "customer"}
          >
            <CarFront size={17} /> Customer
          </button>
          <button
            type="button"
            className={workspace === "dealership" ? "workspace-option active" : "workspace-option"}
            onClick={() => { setWorkspace("dealership"); setRegistering(false); setError(""); }}
            role="tab"
            aria-selected={workspace === "dealership"}
          >
            <Building2 size={16} /> Dealership
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {registering && (
            <div className="form-grid-two">
              <Field label="First name">
                <Input required autoComplete="given-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} />
              </Field>
              <Field label="Last name">
                <Input required autoComplete="family-name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Email address">
            <Input required type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </Field>
          {registering && (
            <Field label="Phone (optional)">
              <Input type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
            </Field>
          )}
          <Field label="Password" hint={registering ? "Use at least 12 characters." : undefined}>
            <Input required type="password" minLength={registering ? 12 : undefined} autoComplete={registering ? "new-password" : "current-password"} value={form.password} onChange={(event) => update("password", event.target.value)} />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" disabled={busy} className="auth-submit">
            {busy ? "Please wait…" : registering ? "Create customer account" : "Continue"}
            {!busy && <ArrowRight size={17} />}
          </Button>
        </form>

        <div className="auth-foot">
          {workspace === "customer" ? (
            <button type="button" className="text-button" onClick={() => { setRegistering((value) => !value); setError(""); }}>
              {registering ? "Already have an account? Sign in" : "New to Service Lane? Create an account"}
            </button>
          ) : (
            <span className="auth-foot-note"><KeyRound size={14} /> Use your dealership staff account.</span>
          )}
          <div className="auth-benefits">
            <span><CalendarDays size={14} /> Simple booking</span>
            <span><CarFront size={14} /> Your vehicles</span>
          </div>
        </div>
      </section>
      <p className="auth-baseline">SERVICE THAT FITS YOUR DAY <span>·</span> BUILT FOR THE ROAD AHEAD</p>
    </main>
  );
}
