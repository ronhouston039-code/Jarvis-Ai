import { useEffect, useState } from "react";
import { useQuery } from "deepspace";
import { Link } from "react-router-dom";
import { authenticatedFetch } from "../jarvis/client";
import type { WeatherSnapshot } from "../jarvis/weather";
import { Button, Input } from "./ui";
type Place = { id: number; label: string; latitude: number; longitude: number };
export function requestLocation(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("location_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: Number(coords.latitude.toFixed(2)),
          longitude: Number(coords.longitude.toFixed(2)),
        }),
      reject,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    );
  });
}
export function WeatherConnect({ compact = false }: { compact?: boolean }) {
  const { records } = useQuery<{
    label: string;
    latitude: number;
    longitude: number;
  }>("locations", {
    where: { enabled: 1 },
    limit: 1,
  });
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [cityMode, setCityMode] = useState(false);
  const [city, setCity] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const locationId = records[0]?.recordId;
  const locationLabel = records[0]?.data.label;
  const latitude = records[0]?.data.latitude;
  const longitude = records[0]?.data.longitude;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!locationId) {
      setWeather(null);
      return;
    }
    let active = true;
    void authenticatedFetch("/api/jarvis/connections/weather")
      .then(async (r) => {
        if (r.ok) {
          const data = (await r.json()) as WeatherSnapshot;
          if (active) setWeather(data);
        } else if (active) setStatus("Live weather could not be retrieved.");
      })
      .catch(() => {
        if (active) setStatus("Live weather could not be retrieved.");
      });
    return () => {
      active = false;
    };
  }, [locationId, locationLabel, latitude, longitude]);
  async function loadCurrent() {
    setBusy(true);
    setStatus("");
    try {
      const { latitude, longitude } = await requestLocation();
      const result = await authenticatedFetch(
        `/api/weather?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      );
      if (!result.ok) throw new Error("weather_unavailable");
      setWeather((await result.json()) as WeatherSnapshot);
      setPrompt(false);
      setCityMode(false);
    } catch {
      setStatus(
        "Could not use your current location. You can enter a city instead.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function searchCity() {
    setBusy(true);
    setStatus("");
    try {
      const result = await authenticatedFetch(
        "/api/jarvis/connections/cities?q=" + encodeURIComponent(city),
      );
      if (!result.ok) throw new Error("city_search_unavailable");
      const data = (await result.json()) as { places: Place[] };
      setPlaces(data.places);
      if (!data.places.length)
        setStatus("No cities found. Try a nearby city name.");
    } catch {
      setStatus("City lookup is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }
  async function selectCity(place: Place) {
    setBusy(true);
    setStatus("");
    try {
      const result = await authenticatedFetch(
        "/api/jarvis/connections/location",
        {
          label: place.label,
          latitude: place.latitude,
          longitude: place.longitude,
          enabled: 1,
        },
      );
      await result.json();
      if (!result.ok) throw new Error("location_save_failed");
      setPrompt(false);
      setCityMode(false);
      setPlaces([]);
      setDismissed(false);
    } catch {
      setStatus("Could not save this city. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      if (locationId) {
        const result = await authenticatedFetch(
          "/api/jarvis/connections/disable",
          { collection: "locations", recordId: locationId },
        );
        await result.json();
        if (!result.ok) throw new Error("disconnect_failed");
      }
      setWeather(null);
      setPrompt(false);
      setDismissed(true);
      setStatus("Weather location disconnected.");
    } catch {
      setStatus("Could not disconnect location. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const updated = weather
    ? Math.max(0, Math.floor((now - Date.parse(weather.retrievedAt)) / 60000))
    : 0;
  return (
    <section
      className={compact ? "weather-widget" : "personal-card weather-widget"}
    >
      <div>
        <h2>WEATHER</h2>
        {weather ? (
          <>
            <h3>
              {weather.location} · {weather.temperature}°F
            </h3>
            <p>
              {weather.description} · Feels like {weather.feelsLike}°F
            </p>
            {weather.high !== null && weather.low !== null && (
              <p>
                High {weather.high}° · Low {weather.low}°
              </p>
            )}
            {!compact && (
              <>
                <p>Location: {weather.location} · Approximate</p>
                <p>Shows current conditions and forecasts.</p>
                <p>
                  Last updated:{" "}
                  {updated < 1 ? "Just now" : `${updated} minutes ago`}.
                </p>
                <p className="muted text-sm">{weather.source}</p>
                {weather.forecast.map((day) => (
                  <p key={day.date}>
                    {day.date}: High {day.high}° · Low {day.low}° · Rain{" "}
                    {day.rainChance}%
                  </p>
                ))}
              </>
            )}
          </>
        ) : (
          <p>
            {compact
              ? "Tap to set weather location"
              : dismissed
                ? "Weather disconnected."
                : "To show local weather, I need your approximate location."}
          </p>
        )}
        <div className="connection-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPrompt(true);
              setCityMode(false);
              setDismissed(false);
            }}
          >
            {weather ? "Change location" : "Set weather location"}
          </Button>
          {weather && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect weather
            </Button>
          )}
        </div>
        {prompt && (
          <div role="dialog" aria-label="Weather location permission">
            <p>To show local weather, I need your approximate location.</p>
            <p className="muted text-sm">
              Current location is rounded and used for this weather request
              only. Choosing a city saves it privately with your account.
            </p>
            <div className="connection-actions">
              <Button disabled={busy} onClick={() => void loadCurrent()}>
                Use current location
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setCityMode(true)}
              >
                Enter a city instead
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPrompt(false);
                  setCityMode(false);
                  setDismissed(true);
                }}
              >
                Not now
              </Button>
            </div>
            {cityMode && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void searchCity();
                }}
              >
                <label>
                  City
                  <Input
                    aria-label="Weather city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <Button disabled={busy} type="submit">
                  Find city
                </Button>
                <p className="muted text-sm">
                  Select a result to save it as your weather location.
                </p>
                {places.map((place) => (
                  <Button
                    key={place.id}
                    variant="outline"
                    disabled={busy}
                    onClick={() => void selectCity(place)}
                    type="button"
                  >
                    {place.label}
                  </Button>
                ))}
              </form>
            )}
          </div>
        )}
        {!compact && (
          <Link to="/connections?tab=location">Manage saved location</Link>
        )}
        {status && <p role="status">{status}</p>}
      </div>
    </section>
  );
}

export function WeatherSummary() {
  const { records } = useQuery<{
    label: string;
    latitude: number;
    longitude: number;
  }>("locations", { where: { enabled: 1 }, limit: 1 });
  const location = records[0]?.data;
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  useEffect(() => {
    setWeather(null);
    if (!location) return;
    let active = true;
    void authenticatedFetch("/api/jarvis/connections/weather")
      .then(async (r) => {
        if (r.ok) {
          const data = (await r.json()) as WeatherSnapshot;
          if (active) setWeather(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location?.label, location?.latitude, location?.longitude]);
  return (
    <div>
      {weather ? (
        <>
          <strong>
            {weather.location.split(",")[0]} · {weather.temperature}°F
          </strong>
          <span>
            {weather.description} · Feels {weather.feelsLike}°
          </span>
          <span>
            High {weather.high ?? "—"}° · Low {weather.low ?? "—"}°
          </span>
        </>
      ) : (
        <>
          <strong>WEATHER</strong>
          <span>{location ? "Check live weather" : "Tap to set location"}</span>
        </>
      )}
    </div>
  );
}
