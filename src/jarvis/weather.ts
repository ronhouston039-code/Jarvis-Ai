import { z } from "zod";
import { currentWeather } from "./connections";
import { resolveTemperatureUnit, type TemperatureUnit } from "./contracts";
export const GOLDSBORO = { latitude: 35.3849, longitude: -77.9928, label: "Goldsboro, North Carolina" };
export const weatherRequestQuery = z.object({
  lat: z.string().trim().min(1).transform(Number).pipe(z.number().min(-90).max(90)).optional(),
  lon: z.string().trim().min(1).transform(Number).pipe(z.number().min(-180).max(180)).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  unit: z.enum(["fahrenheit", "celsius"]).optional(),
}).strict().refine(q => (q.lat === undefined) === (q.lon === undefined) && !(q.city && q.lat !== undefined));
export const coordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const weatherCoordinatesQuery = z.object({
  lat: z.string().min(1).transform(Number).pipe(z.number().min(-90).max(90)),
  lon: z.string().min(1).transform(Number).pipe(z.number().min(-180).max(180)),
});
export type WeatherSnapshot = {
  unit?: TemperatureUnit;
  location: string;
  approximate: boolean;
  temperature: number;
  feelsLike: number;
  condition: string;
  description: string;
  humidity: number | null;
  windSpeed: number | null;
  precipitation?: number | null;
  rainChance?: number | null;
  high: number | null;
  low: number | null;
  retrievedAt: string;
  source: string;
  forecast: { date: string; high: number; low: number; rainChance: number }[];
};
function weatherDescription(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Conditions unavailable";
}
const f = (c: number) => Math.round((c * 9) / 5 + 32);
export async function weatherSnapshot(
  latitude: number,
  longitude: number,
  label = "Current location",
  openWeatherKey?: string,
  unit: TemperatureUnit = "fahrenheit",
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  coordinatesSchema.parse({ latitude, longitude });
  const data = await currentWeather(latitude, longitude, signal);
  const current = data.current as {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m?: number;
    precipitation?: number;
  };
  const daily = data.daily as {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
  if (
    !Number.isFinite(current?.temperature_2m) ||
    !Number.isFinite(current?.apparent_temperature)
  )
    throw new Error("weather_unavailable");
  const temp = (value: number) => unit === "celsius" ? Math.round(value) : f(value);
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  let result: WeatherSnapshot = {
    unit,
    location: label,
    approximate: true,
    temperature: temp(current.temperature_2m),
    feelsLike: temp(current.apparent_temperature),
    condition: weatherDescription(current.weather_code),
    description: weatherDescription(current.weather_code),
    humidity: finite(current.relative_humidity_2m) ? current.relative_humidity_2m : null,
    windSpeed: finite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m / 1.609344) : null,
    precipitation: finite(current.precipitation) ? current.precipitation : null,
    rainChance: finite(daily?.precipitation_probability_max?.[0]) ? daily.precipitation_probability_max[0] : null,
    high:
      !finite(daily?.temperature_2m_max?.[0])
        ? null
        : temp(daily.temperature_2m_max[0]),
    low:
      !finite(daily?.temperature_2m_min?.[0])
        ? null
        : temp(daily.temperature_2m_min[0]),
    retrievedAt: data.retrievedAt,
    source: "Open-Meteo",
    forecast: (Array.isArray(daily?.time) ? daily.time : []).flatMap((date, i) => finite(daily.temperature_2m_max?.[i]) && finite(daily.temperature_2m_min?.[i]) && finite(daily.precipitation_probability_max?.[i]) ? [{
      date,
      high: temp(daily.temperature_2m_max[i]),
      low: temp(daily.temperature_2m_min[i]),
      rainChance: daily.precipitation_probability_max[i],
    }] : []),
  };
  if (openWeatherKey) {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.search = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      units: "imperial",
      appid: openWeatherKey,
    }).toString();
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("weather_unavailable");
    const raw = (await response.json()) as {
      name?: string;
      main?: { temp: number; feels_like: number; humidity: number };
      wind?: { speed: number };
      weather?: { main: string; description: string }[];
    };
    if (
      !Number.isFinite(raw.main?.temp) ||
      !Number.isFinite(raw.main?.feels_like)
    )
      throw new Error("weather_unavailable");
    result = {
      ...result,
      location: label === "Current location" ? raw.name || label : label,
      temperature: unit === "celsius" ? Math.round((raw.main!.temp - 32) * 5 / 9) : Math.round(raw.main!.temp),
      feelsLike: unit === "celsius" ? Math.round((raw.main!.feels_like - 32) * 5 / 9) : Math.round(raw.main!.feels_like),
      condition: raw.weather?.[0]?.main ?? "Unknown",
      description: raw.weather?.[0]?.description ?? "",
      humidity: raw.main!.humidity,
      windSpeed: finite(raw.wind?.speed) ? Math.round(raw.wind!.speed) : null,
      source: "OpenWeather conditions / Open-Meteo forecast",
    };
  }
  return result;
}
export async function findCities(query: string, signal?: AbortSignal) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: z.string().trim().min(2).max(120).parse(query).split(",")[0].trim(),
    count: "5",
    language: "en",
    format: "json",
  }).toString();
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("city_search_unavailable");
  const data = (await response.json()) as {
    results?: {
      id: number;
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }[];
  };
  return {
    places: (data.results ?? []).map((place) => ({
      id: place.id,
      label: [place.name, place.admin1, place.country]
        .filter(Boolean)
        .join(", "),
      latitude: place.latitude,
      longitude: place.longitude,
    })),
  };
}

type QueryExecutor = (name: string, params: Record<string, unknown>) => Promise<unknown>;
export async function resolveWeather(execute: QueryExecutor, query: z.infer<typeof weatherRequestQuery>, key?: string, signal?: AbortSignal) {
  const preferences = await execute("records.query", { collection: "preferences", limit: 1 }) as { success: boolean; data?: { records?: { data: { temperatureUnit?: string } }[] } };
  if (!preferences.success) throw new Error("weather_unavailable");
  const unit = query.unit ?? resolveTemperatureUnit(preferences.data?.records?.[0]?.data.temperatureUnit);
  let place = GOLDSBORO;
  if (query.lat !== undefined && query.lon !== undefined) place = { latitude: query.lat, longitude: query.lon, label: "Current location" };
  else if (query.city && /^Goldsboro, (?:North Carolina|NC)(?:, (?:USA|United States))?$/i.test(query.city)) place = GOLDSBORO;
  else if (query.city) {
    const { places } = await findCities(query.city, signal);
    const aliases: Record<string, string> = { nc: "north carolina", ny: "new york", usa: "united states", us: "united states" };
    const qualifiers = query.city.split(",").slice(1).map(p => aliases[p.trim().toLowerCase()] ?? p.trim().toLowerCase());
    const matches = places.filter(p => qualifiers.every(q => p.label.toLowerCase().includes(q)));
    if (matches.length !== 1) throw new Error(matches.length ? "city_ambiguous" : "city_not_found");
    place = matches[0];
  } else {
    const saved = await execute("records.query", { collection: "locations", where: { enabled: 1 }, limit: 1 }) as { success: boolean; data?: { records?: { data: typeof GOLDSBORO }[] } };
    if (!saved.success) throw new Error("weather_unavailable");
    const location = saved.data?.records?.[0]?.data;
    if (location && coordinatesSchema.safeParse({ latitude: location.latitude, longitude: location.longitude }).success && typeof location.label === "string") place = location;
  }
  return weatherSnapshot(place.latitude, place.longitude, place.label, key, unit, signal);
}
