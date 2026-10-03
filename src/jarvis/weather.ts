import { z } from "zod";
import { currentWeather } from "./connections";
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
  location: string;
  approximate: boolean;
  temperature: number;
  feelsLike: number;
  condition: string;
  description: string;
  humidity: number | null;
  windSpeed: number;
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
): Promise<WeatherSnapshot> {
  coordinatesSchema.parse({ latitude, longitude });
  const data = await currentWeather(latitude, longitude);
  const current = data.current as {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m?: number;
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
  let result: WeatherSnapshot = {
    location: label,
    approximate: true,
    temperature: f(current.temperature_2m),
    feelsLike: f(current.apparent_temperature),
    condition: weatherDescription(current.weather_code),
    description: weatherDescription(current.weather_code),
    humidity: current.relative_humidity_2m ?? null,
    windSpeed: Math.round(current.wind_speed_10m / 1.609344),
    high:
      daily?.temperature_2m_max?.[0] === undefined
        ? null
        : f(daily.temperature_2m_max[0]),
    low:
      daily?.temperature_2m_min?.[0] === undefined
        ? null
        : f(daily.temperature_2m_min[0]),
    retrievedAt: data.retrievedAt,
    source: "Open-Meteo",
    forecast: (daily?.time ?? []).map((date, i) => ({
      date,
      high: f(daily.temperature_2m_max[i]),
      low: f(daily.temperature_2m_min[i]),
      rainChance: daily.precipitation_probability_max[i],
    })),
  };
  if (openWeatherKey) {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.search = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      units: "imperial",
      appid: openWeatherKey,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
      temperature: Math.round(raw.main!.temp),
      feelsLike: Math.round(raw.main!.feels_like),
      condition: raw.weather?.[0]?.main ?? "Unknown",
      description: raw.weather?.[0]?.description ?? "",
      humidity: raw.main!.humidity,
      windSpeed: Math.round(raw.wind?.speed ?? 0),
      source: "OpenWeather conditions / Open-Meteo forecast",
    };
  }
  return result;
}
export async function findCities(query: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: z.string().trim().min(2).max(120).parse(query),
    count: "5",
    language: "en",
    format: "json",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
