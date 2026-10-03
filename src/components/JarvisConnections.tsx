import { HomeAssistantConnection } from "./HomeAssistantConnection";
import { MusicPlaylistLinks } from "./MusicPlaylistLinks";
import { WeatherConnect } from "./WeatherConnect";
import { AppleMusicConnect } from "./AppleMusicConnect";
import { useEffect, useState } from "react";
import { useQuery } from "deepspace";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../jarvis/client";
import { shortcutUrl } from "../jarvis/connections";
import { Button, Input } from "./ui";

type Device = {
  name: string;
  kind: string;
  onShortcut: string;
  offShortcut: string;
  enabled: number;
};
type Location = {
  label: string;
  latitude: number;
  longitude: number;
  enabled: number;
};
type LiveData = {
  source?: string;
  retrievedAt?: string;
  temperature?: number;
  feelsLike?: number;
  description?: string;
  high?: number | null;
  low?: number | null;
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
  results?: { title: string; snippet: string; url: string }[];
  headlines?: { title: string; publishedAt: string; url: string }[];
};
function LiveResults({ data }: { data: LiveData }) {
  const temperature = (value: number | undefined) =>
    value === undefined
      ? "Unavailable"
      : `${Math.round(value)}°C / ${Math.round((value * 9) / 5 + 32)}°F`;
  const safeLink = (url: string) => {
    try {
      return new URL(url).protocol === "https:" ? url : "#";
    } catch {
      return "#";
    }
  };
  return (
    <section className="live-result" aria-label="Live information results">
      <p className="eyebrow">{data.source}</p>
      <p className="muted text-sm">
        Retrieved{" "}
        {data.retrievedAt ? new Date(data.retrievedAt).toLocaleString() : "now"}
      </p>
      {typeof data.temperature === "number" && (
        <>
          <h3>{data.temperature}°F</h3>
          <p>
            {data.description} · Feels like {data.feelsLike}°F
          </p>
          {typeof data.high === "number" && typeof data.low === "number" && (
            <p>
              High {data.high}° · Low {data.low}°
            </p>
          )}
        </>
      )}
      {data.current && (
        <>
          <h3>{temperature(data.current.temperature_2m)}</h3>
          <p>
            Feels like {temperature(data.current.apparent_temperature)} ·
            Precipitation {data.current.precipitation ?? "Unavailable"} mm ·
            Wind {data.current.wind_speed_10m ?? "Unavailable"} km/h
          </p>
          {data.daily?.time?.map((date, i) => (
            <p key={date}>
              {date}: {temperature(data.daily?.temperature_2m_min?.[i])} to{" "}
              {temperature(data.daily?.temperature_2m_max?.[i])} · Rain chance{" "}
              {data.daily?.precipitation_probability_max?.[i] ?? "Unavailable"}%
            </p>
          ))}
        </>
      )}
      {data.headlines?.map((item) => (
        <article key={item.url}>
          <h3>
            <a href={safeLink(item.url)} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          </h3>
          <p className="muted text-sm">{item.publishedAt}</p>
        </article>
      ))}
      {data.results?.map((item) => (
        <article key={item.url}>
          <h3>
            <a href={safeLink(item.url)} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          </h3>
          <p>{item.snippet}</p>
        </article>
      ))}
    </section>
  );
}
const tabs = [
  "apps",
  "location",
  "home",
  "music",
  "live",
  "security",
  "vehicle",
] as const;
export function JarvisConnections() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "apps";
  const { records: devices } = useQuery<Device>("device-shortcuts", {
    where: { enabled: 1 },
  });
  const { records: locations } = useQuery<Location>("locations", {
    where: { enabled: 1 },
    limit: 1,
  });
  const [label, setLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("tv");
  const [onShortcut, setOn] = useState("");
  const [offShortcut, setOff] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveData | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const l = locations[0]?.data;
    if (l) {
      setLabel(l.label);
      setLatitude(String(l.latitude));
      setLongitude(String(l.longitude));
    }
  }, [locations]);
  async function save(path: string, body: unknown) {
    setBusy(true);
    setStatus("");
    try {
      const result = await authenticatedFetch(
        "/api/jarvis/connections/" + path,
        body,
      );
      await result.json();
      if (result.ok && path === "disable") {
        const disabled = body as { collection?: string };
        if (disabled.collection === "locations") {
          setLabel("");
          setLatitude("");
          setLongitude("");
        }
      }
      setStatus(
        result.ok
          ? "Saved."
          : `Could not save (${result.status}). Check your details.`,
      );
    } catch {
      setStatus("Connection unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function load(path: string) {
    setBusy(true);
    setStatus("");
    setLive(null);
    try {
      const result = await authenticatedFetch(
        "/api/jarvis/connections/" + path,
      );
      const data = (await result.json()) as LiveData & { error?: string };
      if (!result.ok)
        setStatus(
          data.error === "location_required"
            ? "Add your location first."
            : "Live information could not be retrieved.",
        );
      else setLive(data);
    } catch {
      setStatus("Live information could not be retrieved.");
    } finally {
      setBusy(false);
    }
  }
  function gps() {
    setStatus("Requesting a one-time location…");
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLatitude(String(Number(p.coords.latitude.toFixed(2))));
        setLongitude(String(Number(p.coords.longitude.toFixed(2))));
        setLabel(label || "My location");
        setStatus(
          "Location filled. Tap Save location to store it. No continuous tracking.",
        );
      },
      () =>
        setStatus(
          "Location access unavailable. Enter your coordinates manually.",
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    );
    if (!navigator.geolocation)
      setStatus("GPS is unavailable. Enter your location manually.");
  }
  const shortcutCards = (music: boolean) =>
    devices
      .filter((d) => (d.data.kind === "music") === music)
      .map((d) => (
        <section className="personal-card" key={d.recordId}>
          <div>
            <h3>{d.data.name}</h3>
            <p>{d.data.kind} · Apple Shortcuts · State unavailable</p>
            <p className="muted text-sm">
              Your iPhone runs the shortcut after you tap. JARVIS cannot verify
              device state.
            </p>
            <div className="connection-actions">
              <a
                className="connection-action"
                href={shortcutUrl(d.data.onShortcut)}
              >
                {music ? "Play" : "Turn on"}
              </a>
              {d.data.offShortcut && (
                <a
                  className="connection-action"
                  href={shortcutUrl(d.data.offShortcut)}
                >
                  {music ? "Pause" : "Turn off"}
                </a>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void save("disable", {
                    collection: "device-shortcuts",
                    recordId: d.recordId,
                  })
                }
              >
                Remove connection
              </Button>
            </div>
          </div>
        </section>
      ));
  return (
    <div className="personal-page connection-page">
      <p className="eyebrow">YOUR CONNECTED WORLD</p>
      <h1>Connections</h1>
      <nav className="connection-tabs" aria-label="Connections sections">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setParams({ tab: t });
              setLive(null);
              setStatus("");
            }}
          >
            {
              {
                apps: "Apps",
                location: "Location",
                home: "Smart home",
                music: "Apple Music",
                live: "Live information",
                security: "Security",
                vehicle: "Travel",
              }[t]
            }
          </button>
        ))}
      </nav>
      {tab === "apps" && (
        <>
          <h2>Connect a capability</h2>
          <p>
            Choose a service to configure it. No account passwords are collected
            here.
          </p>
          <div className="connection-actions">
            {["location", "home", "music", "live", "security"].map((t) => (
              <Button
                key={t}
                variant="outline"
                onClick={() => setParams({ tab: t })}
              >
                {t === "home"
                  ? "Apple Home / smart devices"
                  : t === "music"
                    ? "Apple Music"
                    : t === "live"
                      ? "Live information"
                      : t === "security"
                        ? "Security status"
                        : "Set location"}
              </Button>
            ))}
          </div>
        </>
      )}
      {tab === "location" && <WeatherConnect />}
      {tab === "location" && (
        <>
          <h2>Your location</h2>
          <p>
            Save a place manually, or request GPS once. Coordinates are shared
            with Open-Meteo only when you ask for weather. Your saved location
            may be sent to your AI provider when you ask location questions.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save("location", {
                label,
                latitude: Number(latitude),
                longitude: Number(longitude),
                enabled: 1,
              });
            }}
          >
            <label>
              Place name
              <Input
                aria-label="Place name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label>
              Latitude
              <Input
                aria-label="Latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
              />
            </label>
            <label>
              Longitude
              <Input
                aria-label="Longitude"
                type="number"
                min={-180}
                max={180}
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
              />
            </label>
            <div className="connection-actions">
              <Button type="button" variant="outline" onClick={gps}>
                Use my iPhone location
              </Button>
              <Button type="submit" disabled={busy}>
                Save location
              </Button>
              {locations[0] && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void save("disable", {
                      collection: "locations",
                      recordId: locations[0].recordId,
                    })
                  }
                >
                  Clear saved location
                </Button>
              )}
            </div>
          </form>
        </>
      )}
      {tab === "music" && (
        <>
          <AppleMusicConnect />
          <MusicPlaylistLinks />
        </>
      )}
      {tab === "home" && <HomeAssistantConnection />}
      {(tab === "home" || tab === "music") && (
        <>
          <h2>
            {tab === "music"
              ? "Apple Music shortcuts (optional)"
              : "Apple Home & smart devices"}
          </h2>
          <p>
            {tab === "music"
              ? "Create an iPhone Shortcut with a Play Music action for your playlist. Add a second shortcut for Pause Music if desired. Your Apple Music subscription and iPhone permissions handle playback."
              : "Open Shortcuts on your iPhone. Create a shortcut using Control My Home, select your TV or device, and set it On. Create another for Off. The device must already work in Apple Home; use its manufacturer’s Shortcuts actions if Apple Home cannot control its power."}
          </p>
          <a className="connection-action" href="shortcuts://">
            Open iPhone Shortcuts
          </a>
          <p className="muted text-sm">
            Enter the exact shortcut names below. This connects a user-tapped
            control, not direct server access to Apple Home or your music
            library. Locks, alarms and security-system controls are not
            supported.
          </p>
          {shortcutCards(tab === "music")}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save("devices", {
                name,
                kind: tab === "music" ? "music" : kind,
                onShortcut,
                offShortcut,
                enabled: 1,
              });
            }}
          >
            <label>
              Display name
              <Input
                aria-label="Device display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </label>
            {tab === "home" && (
              <label>
                Device type
                <select
                  aria-label="Device type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="tv">TV</option>
                  <option value="light">Light</option>
                  <option value="plug">Smart plug</option>
                  <option value="fan">Fan</option>
                </select>
              </label>
            )}
            <label>
              {tab === "music" ? "Play shortcut name" : "On shortcut name"}
              <Input
                aria-label="On shortcut name"
                value={onShortcut}
                onChange={(e) => setOn(e.target.value)}
                maxLength={150}
                required
              />
            </label>
            <label>
              {tab === "music"
                ? "Pause shortcut name (optional)"
                : "Off shortcut name (optional)"}
              <Input
                aria-label="Off shortcut name"
                value={offShortcut}
                onChange={(e) => setOff(e.target.value)}
                maxLength={150}
              />
            </label>
            <Button disabled={busy} type="submit">
              Add connection
            </Button>
          </form>
        </>
      )}
      {tab === "live" && <WeatherConnect />}
      {tab === "live" && (
        <>
          <h2>Live information online</h2>
          <p>
            Weather: Open-Meteo. Headlines: BBC News. Online lookups: Wikipedia.
            Each result includes its source and retrieval time. These are not a
            general web search or an alarm-monitoring service.
          </p>
          <div className="connection-actions">
            <Button disabled={busy} onClick={() => void load("weather")}>
              Check live weather
            </Button>
            <Button disabled={busy} onClick={() => void load("news")}>
              Latest news
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load("search?q=" + encodeURIComponent(query));
            }}
          >
            <label>
              Online lookup
              <Input
                aria-label="Online lookup"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={300}
                required
              />
            </label>
            <Button disabled={busy} type="submit">
              Search online
            </Button>
          </form>
          {live !== null && <LiveResults data={live} />}
          <p className="muted text-sm">
            Weather data by{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{" "}
            (CC BY 4.0). Commercial use requires an appropriate Open-Meteo plan.
          </p>
        </>
      )}
      {tab === "security" && (
        <>
          <h2>JARVIS security online</h2>
          <section className="personal-card">
            <div>
              <p>Session: signed in</p>
              <p>
                Transport:{" "}
                {location.protocol === "https:"
                  ? "HTTPS encrypted"
                  : "Local development HTTP"}
              </p>
              <p>
                Location:{" "}
                {locations.length ? "Saved with your account" : "Not saved"}
              </p>
              <p>Voice: device speech · microphone only when activated</p>
              <p>
                Smart controls: {devices.length} registered shortcuts · explicit
                tap required
              </p>
              <p>Security cameras and alarms: not monitored</p>
            </div>
          </section>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await authenticatedFetch("/api/health");
                setStatus(
                  r.ok
                    ? "JARVIS server reachable."
                    : "JARVIS server unavailable.",
                );
              } catch {
                setStatus("JARVIS server unavailable.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Check server connection
          </Button>
          <p>
            <a href="/settings">Account and privacy settings</a> ·{" "}
            <a href="/personal">Manage private data</a>
          </p>
        </>
      )}
      {tab === "vehicle" && (
        <>
          <h2>Travel</h2>
          <p>
            Open your saved location in Apple Maps. JARVIS does not have access
            to your vehicle or live traffic.
          </p>
          {locations[0] ? (
            <a
              className="connection-action"
              href={`https://maps.apple.com/?ll=${locations[0].data.latitude},${locations[0].data.longitude}&q=${encodeURIComponent(locations[0].data.label)}`}
            >
              Open location in Apple Maps
            </a>
          ) : (
            <Button onClick={() => setParams({ tab: "location" })}>
              Add location
            </Button>
          )}
        </>
      )}
      <p role="status" className="muted">
        {busy ? "Working…" : status}
      </p>
    </div>
  );
}
