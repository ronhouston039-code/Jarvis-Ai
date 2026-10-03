import { WeatherSummary } from "./WeatherConnect";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useQuery } from "deepspace";
import { Link } from "react-router-dom";
import {
  Home,
  MessageSquare,
  LayoutGrid,
  Tv,
  Car,
  Music,
  CalendarDays,
  Shield,
  Settings,
  CloudSun,
  MapPin,
  Mic,
  Wifi,
  WifiOff,
  ChevronRight,
  Brain,
  Clock,
  NotebookPen,
} from "lucide-react";
import { JarvisOrb } from "./JarvisOrb";

type Props = {
  provider: string;
  listening: boolean;
  busy: boolean;
  showChat: boolean;
  onChat: () => void;
  onVoice: () => void;
  onHome: () => void;
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
            <ClockPanel />
            <Link to="/connections?tab=live" className="hud-weather hud-panel">
              <CloudSun size={33} />
              <WeatherSummary />
            </Link>
            <div className="hud-brand">
              <h1>JARVIS</h1>
              <p>YOUR PERSONAL AI ASSISTANT</p>
            </div>
            <Connection />
            <button
              onClick={p.onVoice}
              aria-label="Activate voice input"
              className={`hud-voice hud-panel ${p.listening ? "listening" : ""}`}
            >
              <Mic size={25} />
              <div className="voice-wave">
                {Array.from({ length: 17 }, (_, i) => (
                  <i key={i} style={{ height: `${8 + ((i * 7) % 23)}px` }} />
                ))}
                <span>
                  {p.listening
                    ? "Listening…"
                    : p.busy
                      ? "Responding…"
                      : "Voice standby"}
                </span>
              </div>
            </button>
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
              {[
                { icon: LayoutGrid, label: "APPS", tab: "apps" },
                { icon: Tv, label: "SMART HOME", tab: "home" },
                { icon: Car, label: "VEHICLE", tab: "vehicle" },
                { icon: Music, label: "MEDIA", tab: "music" },
              ].map(({ icon: Icon, label, tab }) => (
                <Link key={label} to={`/connections?tab=${tab}`}>
                  <Icon />
                  {label}
                </Link>
              ))}
              <Link to="/personal">
                <CalendarDays />
                PRODUCTIVITY
              </Link>
              <Link to="/connections?tab=security">
                <Shield />
                SECURITY
              </Link>
              <Link to="/settings">
                <Settings />
                SETTINGS
              </Link>
            </aside>
            <aside className="hud-support">
              <section className="hud-panel system-panel">
                <h2>
                  SYSTEM STATUS <ChevronRight size={14} />
                </h2>
                <ul>
                  <li>
                    <span className="hud-dot" />
                    AI conversation <small>Available</small>
                  </li>
                  <li>
                    <span className="hud-dot" />
                    Personal memory <small>Available</small>
                  </li>
                  <li>
                    <span className="hud-dot" />
                    Reminders <small>Available</small>
                  </li>
                  <li>
                    <span className="hud-dot dim" />
                    Smart devices{" "}
                    <small>
                      {devices.length
                        ? `${devices.length} shortcuts`
                        : "Tap to connect"}
                    </small>
                  </li>
                  <li>
                    <span className="hud-dot dim" />
                    Live information <small>Online sources</small>
                  </li>
                  <li>
                    <span
                      className={serverOnline ? "hud-dot" : "hud-dot dim"}
                    />
                    <Link to="/connections?tab=security">Security status</Link>
                    <small>
                      {serverOnline === null
                        ? "Checking"
                        : serverOnline
                          ? "Server online"
                          : "Unavailable"}
                    </small>
                  </li>
                </ul>
                <Link className="hud-panel-action" to="/connections?tab=apps">
                  Manage connections
                </Link>
              </section>
              <section className="hud-panel quick-panel">
                <h2>QUICK ACTIONS</h2>
                <button onClick={() => p.onPrompt("Help me plan my day")}>
                  <CalendarDays size={17} />
                  Plan my day
                </button>
                <button onClick={() => p.onPrompt("Remind me to ")}>
                  <Clock size={17} />
                  Create reminder
                </button>
                <button onClick={() => p.onPrompt("Remember that ")}>
                  <NotebookPen size={17} />
                  Save a preference
                </button>
                <button
                  onClick={() => p.onPrompt("What can you help me with?")}
                >
                  <Brain size={17} />
                  Ask JARVIS
                </button>
              </section>
              <section className="hud-panel hud-history">
                <h2>CONVERSATIONS</h2>
                {p.history}
              </section>
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
                  <JarvisOrb active={p.listening || p.busy} />
                  <div className="hologram-caption">
                    <span>J.A.R.V.I.S.</span>
                    <p>Ready when you are.</p>
                  </div>
                  <div className="holo-modules">
                    <button className="hud-panel" onClick={p.onChat}>
                      <Brain size={30} />
                      <span>INTELLIGENCE CORE</span>
                      <small>Conversation & reasoning</small>
                    </button>
                    <Link className="hud-panel" to="/personal">
                      <Shield size={30} />
                      <span>YOUR PRIVATE SPACE</span>
                      <small>Memory & reminders</small>
                    </Link>
                  </div>
                </div>
              )}
            </main>
            <aside className="hud-right">
              <section className="hud-panel location-panel">
                <h2>CURRENT LOCATION</h2>
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
                  UPCOMING{" "}
                  <Link to="/personal" aria-label="Manage reminders">
                    +
                  </Link>
                </h2>
                {p.upcoming}
              </section>
              <section className="hud-panel capabilities-panel">
                <h2>AI ASSISTANT</h2>
                <ul>
                  <li>
                    <button
                      onClick={() => p.onPrompt("What can you help me with?")}
                    >
                      Answer questions
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() =>
                        p.onPrompt("Help me think through an idea")
                      }
                    >
                      Think through ideas
                    </button>
                  </li>
                  <li>
                    <Link to="/personal">Plan & create reminders</Link>
                  </li>
                  <li>
                    <Link to="/settings">Remember preferences</Link>
                  </li>
                  <li>
                    <button onClick={p.onChat}>Continue conversations</button>
                  </li>
                </ul>
                <span className="hud-small-label">
                  Connected capabilities only
                </span>
              </section>
              <section className="hud-panel media-panel">
                <h2>MEDIA CONTROL</h2>
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
