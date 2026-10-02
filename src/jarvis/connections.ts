import { z } from "zod";
export const locationInput = z
  .object({
    label: z.string().trim().min(1).max(120),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    enabled: z.literal(1).default(1),
  })
  .strict();
export const shortcutInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["tv", "light", "plug", "fan", "music"]),
    onShortcut: z.string().trim().min(1).max(150),
    offShortcut: z.string().trim().max(150).default(""),
    enabled: z.literal(1).default(1),
  })
  .strict();
export function shortcutUrl(name: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}
export async function currentWeather(latitude: number, longitude: number) {
  const coordinates = locationInput
    .pick({ latitude: true, longitude: true })
    .parse({ latitude, longitude });
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(coordinates).map(([key, value]) => [key, String(value)]),
    ),
    current:
      "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "3",
    timezone: "auto",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("weather_unavailable");
  const data = (await response.json()) as Record<string, unknown>;
  return {
    source: "Open-Meteo",
    retrievedAt: new Date().toISOString(),
    current: data.current,
    units: data.current_units,
    daily: data.daily,
    timezone: data.timezone,
  };
}
export async function onlineSearch(query: string) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: z.string().min(1).max(300).parse(query),
    srlimit: "5",
  }).toString();
  const response = await fetch(url, {
    headers: { "User-Agent": "JarvisPersonalAssistant/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("search_unavailable");
  const body = (await response.json()) as {
    query?: { search?: { title: string; snippet: string; pageid: number }[] };
  };
  return {
    source: "Wikipedia live search (not a general web search)",
    retrievedAt: new Date().toISOString(),
    results: (body.query?.search ?? []).map((r) => ({
      title: r.title,
      snippet: r.snippet.replace(/<[^>]*>/g, ""),
      url: `https://en.wikipedia.org/?curid=${r.pageid}`,
    })),
  };
}
export async function currentNews() {
  const response = await fetch("https://feeds.bbci.co.uk/news/rss.xml", {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("news_unavailable");
  const text = (await response.text()).slice(0, 150000);
  const field = (item: string, name: string) =>
    (item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
  return {
    source: "BBC News",
    retrievedAt: new Date().toISOString(),
    headlines: [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 8)
      .map((m) => ({
        title: field(m[1], "title"),
        url: field(m[1], "link"),
        publishedAt: field(m[1], "pubDate"),
      })),
  };
}
