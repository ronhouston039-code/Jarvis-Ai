import { HomeKitActivity } from "./HomeKitActivity";
import { WeatherSummary } from "./WeatherConnect";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useQuery } from "deepspace";
import { Link } from "react-router-dom";
import {
  Maximize2,
  Home,
  MessageSquare,
  LayoutGrid,
  Tv,
  Music,
  CalendarDays,
  Shield,
  Settings,
  CloudSun,
  MapPin,
  Wifi,
  WifiOff,
  ChevronRight,
  Brain,
} from "lucide-react";
import { JarvisOrb } from "./JarvisOrb";

type Props = {
  provider: string;
  speaking?: boolean;
  listening: boolean;
  busy: boolean;
  showChat: boolean;
  onChat: () => void;
  onVoice: () => void;
  onHome: () => void;
  onFocus: () => void;
  onPrompt: (prompt: string) => void;
  history: ReactNode;
  conversation: ReactNode;
  composer: ReactNode;
  upcoming: ReactNode;
};
function ClockPanel() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Link to="/settings" className="hud-clock hud-panel">
      <strong>
        {now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </strong>
      <span>
        {now.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    </Link>
  );
}
function Connection() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <Link to="/connections?tab=security" className="hud-connection">
      {online ? <Wifi size={20} /> : <WifiOff size={20} />}
      <span>
        {online ? "Network available" : "Offline"}
        <small>Device connection</small>
      </span>
    </Link>
  );
}
export function JarvisHud(p: Props) {
  const { records: locations } = useQuery<{ label: string }>("locations", {
    where: { enabled: 1 },
    limit: 1,
  });
  const { records: devices } = useQuery<{ kind: string }>("device-shortcuts", {
    where: { enabled: 1 },
  });
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/health", { signal: AbortSignal.timeout(5000) })
      .then((response) => {
        if (active) setServerOnline(response.ok);
      })
      .catch(() => {
        if (active) setServerOnline(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [expanded, setExpanded] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = viewport.current;
    const canvas = dashboard.current;
    if (!frame || !canvas) return;
    const update = () => {
      const scale = expanded ? 1 : Math.min(1, frame.clientWidth / 1280);
      canvas.style.transform = scale < 1 ? `scale(${scale})` : "none";
      frame.style.height =
        scale < 1 ? `${canvas.offsetHeight * scale}px` : "auto";
      frame.style.overflowX = scale < 1 ? "hidden" : "auto";
    };
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(update);
    });
    observer.observe(frame);
    observer.observe(canvas);
    update();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(resizeFrame);
    };
  }, [expanded]);
  return (
    <>
      <div className="hud-pan-hint">
        <span>
          {expanded ? "Swipe sideways to explore" : "Full desktop dashboard"}
        </span>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show full overview" : "Zoom dashboard"}
        </button>
      </div>
      <div
        ref={viewport}
        className="hud-viewport"
        role="region"
        aria-label="Full JARVIS dashboard"
        tabIndex={0}
      >
        <div ref={dashboard} className="hud-dashboard">
          <header className="hud-top">
            <div className="hud-brand">
              <h1>JARVIS</h1>
            </div>
            <ClockPanel />
            <Link to="/connections?tab=live" className="hud-weather">
              <CloudSun size={25} />
              <WeatherSummary />
            </Link>
          </header>
          <div className="hud-body">
            <aside className="hud-menu" aria-label="Dashboard navigation">
              <button
                className={!p.showChat ? "active" : ""}
                onClick={p.onHome}
              >
                <Home />
                HOME
              </button>
              <button className={p.showChat ? "active" : ""} onClick={p.onChat}>
                <MessageSquare />
                CHAT
              </button>
              <Link to="/connections?tab=home" aria-label="SMART HOME">
                <Tv />
                Devices
              </Link>
              <Link to="/connections?tab=apps">
                <LayoutGrid />
                Apps
              </Link>
              <button
                onClick={p.onFocus}
                data-greeting-skip
                aria-label="Open Jarvis Focus Mode"
              >
                <Maximize2 />
                Focus
              </button>
              <Link to="/settings">
                <Settings />
                SETTINGS
              </Link>
            </aside>
            <aside className="hud-support">
              <section className="hud-panel system-panel">
                <h2>System Status</h2>
                <p className="system-summary">
                  <span className={serverOnline ? "hud-dot" : "hud-dot dim"} />
                  {serverOnline === null
                    ? "Checking server…"
                    : serverOnline
                      ? "Cloud server operational"
                      : "Cloud unavailable"}
                </p>
                <Link className="system-row" to="/connections?tab=home">
                  <Tv />
                  <span>
                    Smart devices
                    <small>
                      {devices.length
                        ? `${devices.length} shortcuts · state unverified`
                        : "Connect your accessories"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </Link>
                <Connection />
                <Link className="system-row" to="/connections?tab=security">
                  <Shield />
                  <span>
                    Security
                    <small>
                      {serverOnline
                        ? "HTTPS server online"
                        : "Check connection"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </Link>
              </section>
              <section className="hud-panel quick-panel">
                <h2>Quick Actions</h2>
                <div className="quick-grid">
                  <button onClick={() => p.onPrompt("Turn off the TV.")}>
                    <Tv />
                    <span>Turn Off TV</span>
                  </button>
                  <Link to="/connections?tab=music">
                    <Music />
                    <span>Play Music</span>
                  </Link>
                  <Link to="/connections?tab=home">
                    <Home />
                    <span>Smart Home</span>
                  </Link>
                  <Link to="/connections?tab=apps">
                    <LayoutGrid />
                    <span>Open App</span>
                  </Link>
                </div>
                <Link
                  className="hud-panel-action"
                  to="/personal"
                  aria-label="PRODUCTIVITY"
                >
                  Plan my day & reminders
                </Link>
              </section>
              {p.showChat && (
                <section className="hud-panel hud-history">
                  <h2>CONVERSATIONS</h2>
                  {p.history}
                </section>
              )}
            </aside>
            <main className={`hud-main ${p.showChat ? "chat-open" : ""}`}>
              <div className="hud-stage-label">
                <span className="hud-dot" />
                <span>{p.provider} · </span>
                {p.busy
                  ? "PROCESSING REQUEST"
                  : p.listening
                    ? "VOICE INPUT ACTIVE"
                    : "PERSONAL INTELLIGENCE · READY"}
              </div>
              {p.showChat ? (
                <div className="hud-conversation">{p.conversation}</div>
              ) : (
                <div className="hud-hologram">
                  <JarvisOrb active={p.listening || p.busy || p.speaking} />
                </div>
              )}
            </main>
            <aside className="hud-right">
              <section className="hud-panel assistant-panel">
                <Brain size={30} />
                <div>
                  <h2>AI Assistant</h2>
                  <p className="assistant-state">
                    <span
                      className={serverOnline ? "hud-dot" : "hud-dot dim"}
                    />
                    {p.speaking
                      ? "Speaking…"
                      : p.listening
                        ? "Listening…"
                        : p.busy
                          ? "Working…"
                          : serverOnline
                            ? "Ready"
                            : "Checking connection"}
                  </p>
                  <button onClick={p.onChat}>
                    I’m here and ready. How can I help you today?
                  </button>
                </div>
              </section>
              <section className="hud-panel location-panel">
                <h2>
                  <MapPin size={18} />
                  Location
                </h2>
                <Link
                  to="/connections?tab=location"
                  className="map-placeholder"
                  aria-label="Edit my location"
                >
                  <div className="map-grid" />
                  <MapPin size={32} />
                </Link>
                <p>
                  {locations[0]?.data.label ??
                    "Location access is not enabled."}
                </p>
                <small>No continuous tracking.</small>
                <Link
                  className="hud-panel-action"
                  to="/connections?tab=location"
                >
                  {locations.length ? "Edit location" : "Add my location"}
                </Link>
              </section>
              <section className="hud-panel upcoming-panel">
                <h2>
                  <CalendarDays size={18} />
                  Upcoming Reminders{" "}
                  <Link to="/personal" aria-label="Manage reminders">
                    +
                  </Link>
                </h2>
                {p.upcoming}
              </section>
              <section className="hud-panel hud-activity">
                <h2>
                  Recent Activity<Link to="/personal">See all</Link>
                </h2>
                <HomeKitActivity compact />
              </section>
              <section className="hud-panel media-panel">
                <h2>
                  <Music size={18} />
                  Music
                </h2>
                <Music size={24} />
                <p>
                  {devices.some((d) => d.data.kind === "music")
                    ? "Apple Music shortcut registered"
                    : "Apple Music · tap to connect"}
                </p>
                <Link className="hud-panel-action" to="/connections?tab=music">
                  Open media controls
                </Link>
              </section>
            </aside>
          </div>
          <footer className="hud-bottom">{p.composer}</footer>
        </div>
      </div>
    </>
  );
}
