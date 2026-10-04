import { HomeKitActivity } from "./HomeKitActivity";
import { WeatherSummary } from "./WeatherConnect";
import { NowPlaying } from "./dashboard/NowPlaying";
import { useHomeDashboard } from "./dashboard/useHomeDashboard";
import { Modal, Button } from "./ui";
import { spokenVersion } from "./jarvis-speech";
import type { TVShortcutController } from "./devices/useTVShortcuts";
import type { VampShortcutController } from "./devices/useVampShortcut";
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
  Bot,
  Zap,
  Clock3,
} from "lucide-react";
import { DashboardHologram } from "./visualizer/DashboardHologram";
import { AudioWaveform } from "./visualizer/AudioWaveform";
import { HudSubtitles } from "./HudSubtitles";
import type { FocusAudioMeter } from "./focus-audio";
import type { AssistantVisualState } from "./visualizer/visual-state";
import "./jarvis-dashboard.css";

type Props = {
  visualState: AssistantVisualState;
  meter: FocusAudioMeter;
  userCaption: string;
  assistantCaption: string;
  provider: string;
  speaking?: boolean;
  listening: boolean;
  busy: boolean;
  showChat: boolean;
  onChat: () => void;
  onVoice: () => void;
  onHome: () => void;
  onFocus: () => void;
  onContinuousVoice: () => void;
  voiceSessionMode?: "talk" | "wake" | null;
  onTalkToggle?: () => void;
  onWakeToggle?: () => void;
  onPrompt: (prompt: string) => void;
  tvShortcuts?: TVShortcutController;
  vampShortcut?: VampShortcutController;
  onPlayVamp?: () => void;
  onTurnOffTV?: () => void;
  onTurnOnTV?: () => void;
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
  const [wakeConsent, setWakeConsent] = useState(false);
  const home = useHomeDashboard();
  const nativeTV = p.tvShortcuts?.supported ? p.tvShortcuts : null;
  const nativeMusic = p.vampShortcut?.supported ? p.vampShortcut : null;
  const shortcutActivity = [
    ...(nativeTV?.activity ?? []),
    ...(nativeMusic?.activity ?? []),
  ]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 3);
  const tvStatus = home.tv
    ? `${home.tv.online ? "Online" : "Offline"} · ${home.tv.state}`
    : home.phase === "checking"
      ? "Checking connection…"
      : home.phase === "connected"
        ? "Choose an approved TV"
        : home.phase === "disabled"
          ? "Home connection disabled"
          : home.phase === "unavailable"
            ? "Home bridge unavailable"
            : "Connect your accessories";
  const state = p.visualState.activity;
  const { records: locations } = useQuery<{ label: string }>("locations", {
    where: { enabled: 1 },
    limit: 1,
  });
  const { records: devices } = useQuery<{ kind: string; name: string }>(
    "device-shortcuts",
    {
      where: { enabled: 1 },
    },
  );
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
      const scale =
        expanded || frame.clientWidth <= 640
          ? 1
          : Math.min(1, frame.clientWidth / 1280);
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
          {expanded ? "Swipe sideways to explore" : "Responsive dashboard"}
        </span>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show full overview" : "Zoom dashboard"}
        </button>
      </div>
      <div
        ref={viewport}
        className={`hud-viewport ${expanded ? "desktop-expanded" : ""}`}
        role="region"
        aria-label="Full JARVIS dashboard"
        tabIndex={0}
      >
        <div
          ref={dashboard}
          className="hud-dashboard jarvis-desktop-shell"
          data-state={state}
        >
          <header className="hud-top">
            <div className="hud-brand">
              <span className="hud-logo-ring" aria-hidden="true" />
              <h1>JARVIS</h1>
            </div>
            <ClockPanel />
            <button
              className="hud-header-focus"
              aria-label="Full Screen Focus"
              onClick={p.onFocus}
              data-greeting-skip
            >
              <Maximize2 size={18} />
            </button>
            <Link to="/connections?tab=live" className="hud-weather">
              <CloudSun size={25} />
              <WeatherSummary />
            </Link>
          </header>
          <div className="hud-body jarvis-main-content">
            <aside className="hud-menu" aria-label="Dashboard navigation">
              <button
                className={!p.showChat ? "active" : ""}
                onClick={p.onHome}
                aria-label="HOME"
              >
                <Home />
                Home
              </button>
              <button
                className={p.showChat ? "active" : ""}
                onClick={p.onChat}
                aria-label="CHAT"
              >
                <MessageSquare />
                Chat
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
                Settings
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
                    {nativeTV
                      ? "KY TV"
                      : home.tv?.name ||
                        devices.find((d) => d.data.kind === "tv")?.data.name ||
                        "TCL Roku TV"}
                    <small
                      className={
                        !nativeTV && home.tv?.online ? "hud-device-online" : ""
                      }
                    >
                      {nativeTV ? nativeTV.status.label : tvStatus}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </Link>
                {nativeTV && (
                  <div className="system-tv-controls">
                    <button data-greeting-skip onClick={p.onTurnOnTV}>
                      Turn On TV
                    </button>
                    {nativeTV.status.kind === "requested" &&
                      nativeTV.status.action && (
                        <button
                          data-greeting-skip
                          onClick={() =>
                            nativeTV.confirmResult(nativeTV.status.action!)
                          }
                        >
                          Confirm TV is {nativeTV.status.action}
                        </button>
                      )}
                  </div>
                )}
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
                <h2>
                  <Zap size={20} />
                  Quick Actions
                </h2>
                <div className="quick-grid">
                  <button
                    data-greeting-skip
                    onClick={() =>
                      nativeTV
                        ? p.onTurnOffTV?.()
                        : p.onPrompt(
                            home.tv
                              ? `Turn off ${home.tv.name}.`
                              : "Turn off the TV.",
                          )
                    }
                  >
                    <Tv />
                    <span>Turn Off TV</span>
                  </button>
                  {nativeMusic ? (
                    <button data-greeting-skip onClick={p.onPlayVamp}>
                      <Music />
                      <span>Play Vamp</span>
                    </button>
                  ) : (
                    <Link to="/connections?tab=music">
                      <Music />
                      <span>Play Music</span>
                    </Link>
                  )}
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
                <span
                  className="hologram-live-status"
                  role="status"
                  aria-live="polite"
                >
                  {p.visualState.status}
                </span>
              </div>
              <div className="hud-hologram">
                <DashboardHologram
                  visualState={p.visualState}
                  meter={p.meter}
                />
                {(p.userCaption ||
                  p.assistantCaption ||
                  p.listening ||
                  p.busy) && (
                  <HudSubtitles
                    userText={p.userCaption}
                    text={p.assistantCaption}
                    animate={Boolean(p.speaking || p.busy)}
                    state={state}
                  />
                )}

                <div className="hud-voice-modes">
                  <button
                    className="plexus-fullscreen"
                    onClick={p.onContinuousVoice}
                    data-greeting-skip
                  >
                    Start continuous voice session
                  </button>
                  {p.onTalkToggle && (
                    <button
                      className="plexus-fullscreen"
                      data-greeting-skip
                      aria-label="Talk mode"
                      aria-pressed={p.voiceSessionMode === "talk"}
                      onClick={p.onTalkToggle}
                    >
                      {p.voiceSessionMode === "talk"
                        ? "Stop Talk"
                        : "Talk mode"}
                    </button>
                  )}
                  {p.onWakeToggle && (
                    <button
                      className="plexus-fullscreen"
                      data-greeting-skip
                      aria-label="Wake Jarvis"
                      aria-pressed={p.voiceSessionMode === "wake"}
                      onClick={() =>
                        p.voiceSessionMode === "wake"
                          ? p.onWakeToggle?.()
                          : setWakeConsent(true)
                      }
                    >
                      {p.voiceSessionMode === "wake"
                        ? "Stop wake"
                        : "Wake Jarvis"}
                    </button>
                  )}
                </div>
              </div>
              {p.showChat && (
                <div className="hud-conversation">{p.conversation}</div>
              )}
            </main>
            <aside className="hud-right jarvis-sidebar-right">
              <section className="hud-panel assistant-panel">
                <Bot size={30} />
                <div>
                  <h2>AI Assistant</h2>
                  <p className="assistant-state">
                    <span
                      className={serverOnline ? "hud-dot" : "hud-dot dim"}
                    />
                    {state === "idle" && p.visualState.phase === "idle"
                      ? serverOnline
                        ? "Online"
                        : "Checking connection"
                      : p.visualState.status}
                  </p>
                  <button onClick={p.onChat}>
                    {p.assistantCaption
                      ? spokenVersion(p.assistantCaption)
                      : "I’m here and ready. How can I help you today?"}
                  </button>
                </div>
                <AudioWaveform state={state} meter={p.meter} compact />
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
                <p className="hud-location-name">
                  {locations[0]?.data.label ??
                    "Location access is not enabled."}
                </p>
                <small>No continuous tracking.</small>
                <Link
                  className="hud-panel-action"
                  to={
                    locations.length
                      ? "/connections?tab=location"
                      : "/connections?tab=location&city=Goldsboro%2C%20NC"
                  }
                >
                  {locations.length ? "Edit location" : "Set Goldsboro, NC"}
                </Link>
              </section>
              <section className="hud-panel upcoming-panel">
                <h2>
                  <CalendarDays size={18} />
                  Upcoming Reminders{" "}
                  <Link to="/personal" aria-label="Manage reminders">
                    See all
                  </Link>
                </h2>
                {p.upcoming}
              </section>
              <section className="hud-panel hud-activity">
                <h2>
                  <Clock3 size={18} />
                  Recent Activity<Link to="/personal">See all</Link>
                </h2>
                <div className="hud-activity-feed">
                  {shortcutActivity.map((entry) => (
                    <article className="hud-shortcut-activity" key={entry.id}>
                      <h3>{entry.message}</h3>
                      <time dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>
                    </article>
                  ))}
                  <HomeKitActivity compact />
                </div>
              </section>
              <NowPlaying
                vamp={nativeMusic ?? undefined}
                onPlayVamp={p.onPlayVamp}
              />
            </aside>
          </div>
          <footer className="hud-bottom jarvis-command-bar">
            <div className="hud-command-waves" aria-hidden="true">
              <AudioWaveform state={state} meter={p.meter} />
              <AudioWaveform state={state} meter={p.meter} />
            </div>
            {p.composer}
          </footer>
        </div>
      </div>
      <Modal
        open={wakeConsent}
        onClose={() => setWakeConsent(false)}
        size="sm"
        aria-label="Enable Jarvis wake listening"
      >
        <Modal.Header>
          <Modal.Title>Enable “Jarvis” wake listening?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            JARVIS listens while this app is visible. Your browser’s speech
            recognition service may process microphone audio online to recognise
            the wake phrase.
          </p>
          <p className="muted text-sm">
            Requests go to JARVIS after you say “Jarvis”. This browser mode is
            not local-only wake-word detection. It stops when the app is hidden,
            you turn it off, or the session times out.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="ghost"
            data-greeting-skip
            onClick={() => setWakeConsent(false)}
          >
            Not now
          </Button>
          <Button
            data-greeting-skip
            onClick={() => {
              setWakeConsent(false);
              p.onWakeToggle?.();
            }}
          >
            Enable wake listening
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
