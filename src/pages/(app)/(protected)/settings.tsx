import { useTacticalMap } from "../../../components/maps/TacticalMapProvider";
import { WebSearchSettings } from "../../../components/WebSearchSettings";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { signOut, useQuery, useUser } from "deepspace";
import { ChevronLeft, ChevronRight, Settings, UserRound, Volume2, MessageSquare, Mic, MapPin, Tv, Bell, Monitor, ShieldCheck, Activity } from "lucide-react";
import { SystemStatus } from "../../../components/SystemStatus";
import { useSystemHealth } from "../../../components/SystemHealthProvider";
import { FishVoiceSettings } from "../../../components/FishVoiceSettings";
import { VoiceActivation } from "../../../components/VoiceActivation";
import { ProactivePreferences } from "../../../components/ProactivePreferences";
import { disconnectAppleMusic } from "../../../components/apple-music";
import { JarvisPreferences } from "../../../components/JarvisPreferences";
import { Button } from "../../../components/ui";
import "../../../components/jarvis-settings.css";
import { WeatherConnect } from "../../../components/WeatherConnect";

const sections = [
  ["general", "General", UserRound], ["voice", "Voice & Speech", Volume2],
  ["talk", "Talk Mode", MessageSquare], ["wake", "Wake JARVIS", Mic],
  ["location", "Location & Maps", MapPin], ["devices", "Connected Devices", Tv],
  ["notifications", "Notifications", Bell], ["interface", "Interface", Monitor],
  ["privacy", "Privacy & Security", ShieldCheck], ["system", "System", Activity],
] as const;
function Group({ id, children }: { id: typeof sections[number][0]; children: ReactNode }) {
  const [, title, Icon] = sections.find(s => s[0] === id)!;
  return <section className="settings-group" id={`settings-${id}`} aria-labelledby={`settings-${id}-title`}>
    <h2 id={`settings-${id}-title`}><Icon aria-hidden="true" />{title}</h2>
    <div className="settings-group-body">{children}</div>
  </section>;
}
function Row({ label, value, to }: { label: string; value?: string; to?: string }) {
  const content = <><span className="settings-row-label">{label}</span>{value && <span className="settings-row-value">{value}</span>}{to && <ChevronRight aria-hidden="true" />}</>;
  return to ? <Link className="settings-row" to={to}>{content}</Link> : <div className="settings-row">{content}</div>;
}
export default function SettingsPage() {
  const { user } = useUser();
  const tacticalMap = useTacticalMap();
  const { services } = useSystemHealth();
  const locations = useQuery<{ label: string }>("locations", { where: { enabled: 1 }, limit: 1 });
  const [accountError, setAccountError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  return <div className="jarvis-settings">
    <header className="settings-header">
      <Link to="/home" aria-label="Back to JARVIS"><ChevronLeft aria-hidden="true" /></Link>
      <div><span className="settings-wordmark">JARVIS</span><h1>Settings</h1></div>
      <Settings className="settings-header-icon" aria-hidden="true" />
    </header>
    <div className="settings-layout">
      <nav className="settings-sections" aria-label="Settings sections">
        {sections.map(([id, title, Icon]) => <a key={id} href={`#settings-${id}`}><Icon aria-hidden="true" /><span>{title}</span><ChevronRight aria-hidden="true" /></a>)}
      </nav>
      <div className="settings-groups">
        <Group id="general"><Row label="Name I Call You" value="Sir" /><JarvisPreferences /></Group>
        <Group id="voice"><VoiceActivation /><FishVoiceSettings /></Group>
        <Group id="talk">
          <p className="settings-note">Start and stop a continuous voice session from the dashboard. Sessions stop when you leave or background the app.</p>
          <Row label="Open Talk Mode controls" to="/home?panel=voice" />
        </Group>
        <Group id="wake">
          <Row label="Wake phrase" value="Hey Jarvis" />
          <p className="settings-note">Browser speech recognition runs after dashboard consent while the app is open. Local wake-word detection is not configured.</p>
          <Row label="Open Wake JARVIS controls" to="/home?panel=voice" />
        </Group>
        <Group id="location">
          <Row label="Default weather city" value={locations.status !== "ready" ? "Checking…" : locations.records[0]?.data.label ?? "Goldsboro, NC"} to="/connections?tab=location" />
          <details><summary>Weather source & location controls</summary><WeatherConnect /></details>
          <Row label="Location access" value="Ask when requested" />
          <Button variant="outline" onClick={() => tacticalMap.request()}>Open tactical map</Button>
          <p className="settings-note">Live sharing runs only while the tactical map is open, after Show My Location is tapped. Saved weather locations are managed separately in Connections.</p>
        </Group>
        <Group id="devices">
          {([ ["tv", "TV", "/connections?tab=apps"], ["music", "Music", "/connections?tab=music"], ["home", "Smart Home", "/connections?tab=home"] ] as const).map(([id, label, to]) => {
            const service = services.find(s => s.id === id)!;
            return <Row key={id} label={label} value={service.status === "online" ? "Verified online" : service.enabled ? service.status === "unknown" ? "Configured · unverified" : service.status : "Not connected"} to={to} />;
          })}
          <p className="settings-note">Shortcut handoff does not verify device or playback state.</p>
        </Group>
        <Group id="notifications"><ProactivePreferences /></Group>
        <Group id="interface"><Row label="Cinematic Focus" value="Open" to="/home?mode=focus" /><Row label="Motion" value="Follows device Reduce Motion" /></Group>
        <Group id="privacy">
          <WebSearchSettings />
          <Row label="Memories & activity" to="/personal" />
          <Row label="Manage or disconnect services" to="/connections" />
          <details><summary>How your data is used</summary><p className="settings-note">Chat uses your selected AI provider. Requested Fish Audio speech sends the spoken text to Fish Audio; device voice and dictation use browser or device services. Memories are saved when requested. Service credentials remain server-side.</p></details>
          <div className="settings-account"><span>{user?.name}</span><span className="settings-note">{user?.email}</span></div>
          <Button variant="outline" disabled={signingOut} onClick={async () => {
            setSigningOut(true); setAccountError("");
            try { await disconnectAppleMusic(); await signOut(); }
            catch { setAccountError("Could not sign out. Please try again."); }
            finally { setSigningOut(false); }
          }}>Sign out</Button>
          {accountError && <p role="status">{accountError}</p>}
        </Group>
        <Group id="system"><SystemStatus details /></Group>
      </div>
    </div>
  </div>;
}
