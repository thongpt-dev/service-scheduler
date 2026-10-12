import { useEffect, useState } from "react";
import { ArrowLeftRight, CalendarClock, CalendarDays, CarFront, Home, LogOut, Settings2, Users, Wrench } from "lucide-react";
import { AuthScreen, type Workspace } from "./AuthScreen";
import { api, getAccessToken, setAccessToken } from "./api";
import { Button } from "./components/ui";
import { CustomerWorkspace, type CustomerTab } from "./CustomerWorkspace";
import { DealershipWorkspace, type DealershipTab } from "./DealershipWorkspace";
import "./App.css";

function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [workspace, setWorkspace] = useState<Workspace>(
    () => (localStorage.getItem("service-scheduler.workspace") as Workspace | null) ?? "customer",
  );
  const [customerTab, setCustomerTab] = useState<CustomerTab>("home");
  const [dealershipTab, setDealershipTab] = useState<DealershipTab>("schedule");
  const [sessionMessage, setSessionMessage] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

  useEffect(() => {
    const expireSession = () => {
      setAccessToken(null);
      setToken(null);
      setSessionMessage("Your session expired. Sign in again to continue.");
    };
    window.addEventListener("scheduler:session-expired", expireSession);
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "home" || detail === "book" || detail === "visits" || detail === "garage") {
        setCustomerTab(detail);
      }
    };
    window.addEventListener("scheduler:navigate", navigate);
    return () => {
      window.removeEventListener("scheduler:session-expired", expireSession);
      window.removeEventListener("scheduler:navigate", navigate);
    };
  }, []);

  function authenticate(accessToken: string, nextWorkspace: Workspace) {
    setAccessToken(accessToken);
    localStorage.setItem("service-scheduler.workspace", nextWorkspace);
    setWorkspace(nextWorkspace);
    setToken(accessToken);
    setSessionMessage("");
  }

  async function signOut() {
    try {
      await api.revokeTokens();
    } catch {
      // Expired sessions are already unusable; local sign-out should still finish.
    } finally {
      setAccessToken(null);
      setToken(null);
    }
  }

  async function switchWorkspace() {
    const nextWorkspace = workspace === "customer" ? "dealership" : "customer";
    setWorkspaceNotice("");
    setSwitchingWorkspace(true);
    try {
      if (nextWorkspace === "customer") {
        await api.getMyProfile();
      } else {
        const dealerships = await api.getDealerships();
        const access = await Promise.allSettled(dealerships.map((item) => api.getTechnicians(item.id)));
        if (!access.some((result) => result.status === "fulfilled")) {
          setWorkspaceNotice("This account has no active dealership membership.");
          return;
        }
      }
      localStorage.setItem("service-scheduler.workspace", nextWorkspace);
      setWorkspace(nextWorkspace);
    } catch {
      setWorkspaceNotice(nextWorkspace === "customer"
        ? "This account does not have a customer profile."
        : "This account has no active dealership membership.");
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  const navItems = workspace === "customer"
    ? [
        { id: "home", label: "Home", icon: Home, onClick: () => setCustomerTab("home") },
        { id: "book", label: "Book", icon: CalendarDays, onClick: () => setCustomerTab("book") },
        { id: "visits", label: "Visits", icon: CalendarClock, onClick: () => setCustomerTab("visits") },
        { id: "garage", label: "Garage", icon: CarFront, onClick: () => setCustomerTab("garage") },
      ]
    : [
        { id: "schedule", label: "Schedule", icon: CalendarDays, onClick: () => setDealershipTab("schedule") },
        { id: "book", label: "Book", icon: CalendarClock, onClick: () => setDealershipTab("book") },
        { id: "customers", label: "People", icon: Users, onClick: () => setDealershipTab("customers") },
        { id: "setup", label: "Setup", icon: Settings2, onClick: () => setDealershipTab("setup") },
      ];

  const activeTab = workspace === "customer" ? customerTab : dealershipTab;

  if (!token) return <AuthScreen onAuthenticated={authenticate} />;

  return (
    <main className="app-frame">
      <header className="app-topbar">
        <a className="brand-lockup compact" href="#home">
          <span className="brand-icon"><Wrench size={17} /></span>
          <span>service<span className="brand-accent">lane</span></span>
        </a>
        <div className="topbar-actions">
          <Button variant="quiet" size="icon" title="Switch workspace" aria-label="Switch workspace" disabled={switchingWorkspace} onClick={() => void switchWorkspace()}>
            <ArrowLeftRight size={18} />
          </Button>
          <Button variant="quiet" size="icon" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut size={18} />
          </Button>
        </div>
      </header>
      {sessionMessage && <p className="session-message">{sessionMessage}</p>}
      <div className="workspace-label"><span className="workspace-label-dot" /><span>{workspace === "customer" ? "CUSTOMER SPACE" : "DEALERSHIP WORKSPACE"}</span><button type="button" disabled={switchingWorkspace} onClick={() => void switchWorkspace()}><ArrowLeftRight size={13} /> Switch</button></div>
      {workspaceNotice && <p className="workspace-notice" role="status">{workspaceNotice}</p>}
      {workspace === "customer"
        ? <CustomerWorkspace tab={customerTab} onDealershipCreated={(dealership) => {
            localStorage.setItem("service-scheduler.dealership-id", dealership.id);
          localStorage.setItem("service-scheduler.workspace", "dealership");
            setDealershipTab("setup");
            setWorkspace("dealership");
          }} />
        : <DealershipWorkspace tab={dealershipTab} />}
      <nav className="bottom-nav" aria-label={`${workspace} navigation`}>
        {navItems.map(({ id, label, icon: Icon, onClick }) => (
          <button type="button" key={id} className={activeTab === id ? "nav-item active" : "nav-item"} onClick={onClick} aria-current={activeTab === id ? "page" : undefined}>
            <span className="nav-icon"><Icon size={19} strokeWidth={activeTab === id ? 2.2 : 1.8} /></span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

export default App;
