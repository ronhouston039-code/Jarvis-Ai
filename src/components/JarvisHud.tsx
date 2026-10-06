import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Menu, Settings, Tv, Music, CalendarDays, Search, MapPin, Shield, MoreHorizontal, Maximize2, X, Sun, Cloud, CloudRain, CloudSnow } from "lucide-react";
import { Modal, Button } from "./ui";
import { useSystemHealth } from "./SystemHealthProvider";
import { SystemStatus, SystemHealthActivity } from "./SystemStatus";
import { WeatherSummary } from "./WeatherConnect";
import { HomeTacticalMap, useTacticalMap } from "./maps/TacticalMapProvider";
import { HolographicGlobe } from "./visualizer/HolographicGlobe";
import { HudSubtitles } from "./HudSubtitles";
import { NowPlaying } from "./dashboard/NowPlaying";
import { HomeKitActivity } from "./HomeKitActivity";
import type { TVShortcutController } from "./devices/useTVShortcuts";
import type { VampShortcutController } from "./devices/useVampShortcut";
import type { FocusAudioMeter } from "./focus-audio";
import type { AssistantVisualState } from "./visualizer/visual-state";
import "./jarvis-home.css";
type Props = {
  visualState: AssistantVisualState;
  meter: FocusAudioMeter;
  userCaption: string;
  assistantCaption: string;
  weatherDetails?: string;
  searchActivity?: { id: string; message: string; timestamp: string }[];
  provider: string;
  speaking?: boolean;
  replyCompleted?: boolean;
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
/** Presentation only. All actions delegate to the existing assistant/controllers. */
export function JarvisHud(p: Props) {
  const { weather, home, services } = useSystemHealth();
  const map = useTacticalMap();
  const [now, setNow] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(new URLSearchParams(location.search).get("panel") === "voice");
  const [moreOpen, setMoreOpen] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const [wakeConsent, setWakeConsent] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const nativeTV = p.tvShortcuts?.supported ? p.tvShortcuts : null;
  const nativeMusic = p.vampShortcut?.supported ? p.vampShortcut : null;
  useEffect(() => { if (nativeMusic?.canReport || nativeTV?.status.kind === "requested") setMoreOpen(true); }, [nativeMusic?.canReport, nativeTV?.status.kind]);
  const activity = p.visualState.activity;
  const stage = activity !== "idle" ? activity.toUpperCase() : p.visualState.phase === "error-or-fallback" ? "ERROR" : p.replyCompleted ? "COMPLETE" : "READY";
  const condition = weather?.description.toLowerCase() ?? "";
  const WeatherIcon = /snow|sleet|ice/.test(condition) ? CloudSnow : /rain|drizzle|storm/.test(condition) ? CloudRain : /cloud|overcast|fog/.test(condition) ? Cloud : Sun;
  const entries = [...(p.searchActivity ?? []), ...(nativeTV?.activity ?? []), ...(nativeMusic?.activity ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
  function run(callback?: () => void) { setMenuOpen(false); callback?.(); }
  return <div className="jarvis-home hud-dashboard jarvis-desktop-shell" data-state={activity}>
    <header className="j-home-header">
      <button aria-label="Open dashboard navigation" aria-haspopup="dialog" aria-expanded={menuOpen} data-greeting-skip onClick={() => setMenuOpen(true)}><Menu /></button>
      <div className="hud-brand"><h1>JARVIS</h1></div>
      <Link to="/settings" aria-label="Settings"><Settings size={18} /><span>Settings</span></Link>
    </header>
    <div className="j-home-content">
      <section className="j-home-greeting" aria-label="Home briefing">
        <h2>Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}, Sir.</h2>
        <div className="j-home-health"><span>SYSTEM STATUS:</span><SystemStatus /></div>
      </section>
      <Link className="j-home-weather hud-weather" to="/connections?tab=live"><WeatherIcon aria-hidden="true" />{weather ? <WeatherSummary /> : <div><strong>Goldsboro, NC</strong><span>{services.find(s => s.id === "weather")?.message ?? "Weather status unknown"}</span></div>}</Link>
      <main className="j-home-core hud-main">
        <div className="j-home-sphere dashboard-hologram" data-state={activity}><HolographicGlobe variant="neural" visualState={p.visualState} meter={p.meter} /></div>
        <div className="j-home-state-plate" aria-label="JARVIS runtime state"><strong>{stage}</strong></div>
        <p className="hologram-live-status" role="status">{p.visualState.status}</p>
        <div className="assistant-panel">{(p.userCaption || p.assistantCaption || p.busy || p.listening) && <HudSubtitles userText={p.userCaption} text={p.assistantCaption} animate={Boolean(p.speaking || p.busy)} state={activity} />}</div>
      </main>
      <section className="j-home-map hud-right jarvis-sidebar-right" aria-label="Home location map">
        <h2>LOCATION // GOLDSBORO</h2><HomeTacticalMap />
      </section>
      <nav className="j-home-actions quick-grid" aria-label="Quick actions">
        <button data-greeting-skip onClick={() => setTvOpen(true)}><Tv /><span>TV</span></button>
        <button data-greeting-skip onClick={() => nativeMusic ? p.onPlayVamp?.() : setMoreOpen(true)}><Music /><span>Music</span></button>
        <Link to="/personal"><CalendarDays /><span>Reminders</span></Link>
        <button data-greeting-skip onClick={() => { p.onChat(); document.querySelector<HTMLTextAreaElement>('[aria-label="Message JARVIS"]')?.focus(); }}><Search /><span>Search</span></button>
        <button data-greeting-skip onClick={() => map.request()}><MapPin /><span>Maps</span></button>
        <Link to="/settings#settings-privacy"><Shield /><span>Security</span></Link>
        <button data-greeting-skip onClick={() => setMoreOpen(true)}><MoreHorizontal /><span>More</span></button>
      </nav>
      {p.showChat && <section className="j-home-chat" aria-label="Conversation"><button className="j-home-close" aria-label="Close conversation" onClick={p.onHome}><X /></button>{p.conversation}</section>}
    </div>
    <footer className="j-home-command hud-bottom jarvis-command-bar">{p.composer}</footer>
    <Modal open={menuOpen} onClose={() => setMenuOpen(false)} aria-label="JARVIS menu" size="sm">
      <Modal.Header><Modal.Title>JARVIS menu</Modal.Title></Modal.Header>
      <Modal.Body><nav className="j-home-menu" aria-label="Dashboard navigation">
        <Button aria-label="HOME" onClick={() => run(p.onHome)}>Home</Button>
        <Button aria-label="CHAT" onClick={() => run(p.onChat)}>Conversation</Button>
        <Link to="/connections">Connections</Link>
        <Link to="/personal" aria-label="PRODUCTIVITY">Reminders & memories</Link>
        <Button aria-label="Full Screen Focus" data-greeting-skip onClick={() => run(p.onFocus)}><Maximize2 />Cinematic Focus</Button>
        <Button data-greeting-skip onClick={() => run(p.onContinuousVoice)}>Start continuous voice session</Button>
        <Button aria-label="Talk mode" aria-pressed={p.voiceSessionMode === "talk"} data-greeting-skip onClick={() => run(p.onTalkToggle)}>{p.voiceSessionMode === "talk" ? "Stop Talk" : "Talk mode"}</Button>
        <Button aria-label="Wake Jarvis" aria-pressed={p.voiceSessionMode === "wake"} data-greeting-skip onClick={() => { setMenuOpen(false); if (p.voiceSessionMode === "wake") p.onWakeToggle?.(); else setWakeConsent(true); }}>{p.voiceSessionMode === "wake" ? "Stop wake" : "Wake Jarvis"}</Button>
      </nav></Modal.Body>
    </Modal>
    <Modal open={tvOpen} onClose={() => setTvOpen(false)} aria-label="TV controls" size="sm"><Modal.Header><Modal.Title>TV controls</Modal.Title></Modal.Header><Modal.Body>
      <p>{nativeTV?.status.label ?? (home.tv ? `${home.tv.name} · ${home.tv.online ? "Online" : "Offline"}` : "No verified TV connection. Manage your saved connections.")}</p>
      <Button data-greeting-skip onClick={() => { setTvOpen(false); nativeTV ? p.onTurnOnTV?.() : p.onPrompt("Turn on the TV."); }}>Turn On TV</Button>
      <Button data-greeting-skip onClick={() => { setTvOpen(false); nativeTV ? p.onTurnOffTV?.() : p.onPrompt(home.tv ? `Turn off ${home.tv.name}.` : "Turn off the TV."); }}>Turn Off TV</Button>
      <Link to="/connections?tab=apps">Manage TV connections</Link>
    </Modal.Body></Modal>
    <section className="j-home-more" hidden={!moreOpen} aria-label="JARVIS activity and controls"><button className="j-home-close" aria-label="Close activity and controls" onClick={() => setMoreOpen(false)}><X /></button><h2>Activity & controls</h2>
      <NowPlaying vamp={nativeMusic ?? undefined} onPlayVamp={p.onPlayVamp} />
      {nativeTV && <p>{nativeTV.status.label}</p>}
      {nativeTV?.status.kind === "requested" && nativeTV.status.action && <Button data-greeting-skip onClick={() => nativeTV.confirmResult(nativeTV.status.action!)}>Confirm TV is {nativeTV.status.action}</Button>}
      <h2>Upcoming reminders</h2>{p.upcoming}
      <section className="hud-activity"><h2>Recent activity</h2>{entries.map(e => <article className="hud-shortcut-activity" key={e.id}><h3>{e.message}</h3><time dateTime={e.timestamp}>{new Date(e.timestamp).toLocaleTimeString()}</time></article>)}<SystemHealthActivity compact /><HomeKitActivity compact /></section>
      <h2>Conversations</h2>{p.history}
    </section>
    <Modal open={wakeConsent} onClose={() => setWakeConsent(false)} aria-label="Enable Jarvis wake listening" size="sm"><Modal.Header><Modal.Title>Enable “Jarvis” wake listening?</Modal.Title></Modal.Header><Modal.Body><p>JARVIS listens while this app is visible. Your browser’s speech recognition service may process microphone audio online to recognise the wake phrase.</p><p>This browser mode is not local-only wake-word detection. It stops when the app is hidden, you turn it off, or the session times out.</p></Modal.Body><Modal.Footer><Button data-greeting-skip variant="ghost" onClick={() => setWakeConsent(false)}>Not now</Button><Button data-greeting-skip onClick={() => { setWakeConsent(false); p.onWakeToggle?.(); }}>Enable wake listening</Button></Modal.Footer></Modal>
  </div>;
}
