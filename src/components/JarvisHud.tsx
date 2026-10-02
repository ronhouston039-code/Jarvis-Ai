import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Home,
  MessageSquare,
  LayoutGrid,
  Tv,
  Car,
  Music,
  Gamepad2,
  CalendarDays,
  Shield,
  Globe,
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
    <div className="hud-clock hud-panel">
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
    </div>
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
    <span className="hud-connection">
      {online ? <Wifi size={20} /> : <WifiOff size={20} />}
      <span>
        {online ? "Network available" : "Offline"}
        <small>Device connection</small>
      </span>
    </span>
  );
}
export function JarvisHud(p: Props) {
  return (
    <div className="hud-dashboard">
      <header className="hud-top">
        <ClockPanel />
        <div className="hud-weather hud-panel">
          <CloudSun size={33} />
          <div>
            <strong>WEATHER</strong>
            <span>Provider not connected</span>
          </div>
        </div>
        <div className="hud-brand">
          <h1>JARVIS</h1>
          <p>YOUR PERSONAL AI ASSISTANT</p>
        </div>
        <Connection />
        <div
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
        </div>
      </header>
      <div className="hud-body">
        <aside className="hud-menu" aria-label="Dashboard navigation">
          <button className={!p.showChat ? "active" : ""} onClick={p.onHome}>
            <Home />
            HOME
          </button>
          <button className={p.showChat ? "active" : ""} onClick={p.onChat}>
            <MessageSquare />
            CHAT
          </button>
          {[
            { icon: LayoutGrid, label: "APPS" },
            { icon: Tv, label: "SMART HOME" },
            { icon: Car, label: "VEHICLE" },
            { icon: Music, label: "MEDIA" },
            { icon: Gamepad2, label: "GAMES" },
          ].map(({ icon: Icon, label }) => (
            <button key={label} disabled title="Integration not connected">
              <Icon />
              {label}
            </button>
          ))}
          <Link to="/personal">
            <CalendarDays />
            PRODUCTIVITY
          </Link>
          <button disabled title="Integration not connected">
            <Shield />
            SECURITY
          </button>
          <button disabled title="Search provider not connected">
            <Globe />
            INTERNET
          </button>
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
                Smart devices <small>Not connected</small>
              </li>
              <li>
                <span className="hud-dot dim" />
                Live information <small>Not connected</small>
              </li>
            </ul>
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
            <button onClick={() => p.onPrompt("What can you help me with?")}>
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
                <div className="hud-panel">
                  <Brain size={30} />
                  <span>INTELLIGENCE CORE</span>
                  <small>Conversation & reasoning</small>
                </div>
                <div className="hud-panel">
                  <Shield size={30} />
                  <span>YOUR PRIVATE SPACE</span>
                  <small>Memory & reminders</small>
                </div>
              </div>
            </div>
          )}
        </main>
        <aside className="hud-right">
          <section className="hud-panel location-panel">
            <h2>CURRENT LOCATION</h2>
            <div className="map-placeholder">
              <div className="map-grid" />
              <MapPin size={32} />
            </div>
            <p>Location access is not enabled.</p>
            <small>No location is being tracked.</small>
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
              <li>Answer questions</li>
              <li>Think through ideas</li>
              <li>Plan & create reminders</li>
              <li>Remember preferences</li>
              <li>Continue conversations</li>
            </ul>
            <span className="hud-small-label">Connected capabilities only</span>
          </section>
          <section className="hud-panel media-panel">
            <h2>MEDIA CONTROL</h2>
            <Music size={24} />
            <p>Music provider not connected</p>
          </section>
        </aside>
      </div>
      <footer className="hud-bottom">{p.composer}</footer>
    </div>
  );
}
