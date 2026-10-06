import type { WeatherSnapshot } from "../jarvis/weather";
import type { TemperatureUnit } from "../jarvis/contracts";
export type WeatherIntent = { city?: string; currentLocation: boolean; unit?: TemperatureUnit };
/** Exact simple requests use the live route; compound requests retain structured agent tools. */
export function weatherIntent(text: string): WeatherIntent | null {
  let query = text.trim().replace(/^(?:hey\s+)?jarvis[,\s]+/i, "").replace(/[?.!]+$/, "").replace(/[’]/g, "'");
  const unitMatch = query.match(/(?:\s+(?:in|using))?\s+(celsius|fahrenheit)$/i);
  const unit = unitMatch?.[1].toLowerCase() as TemperatureUnit | undefined;
  if (unitMatch) query = query.slice(0, unitMatch.index).trim();
  const match = query.match(/^(?:what(?:'s| is) (?:the )?|how is (?:the )?|check (?:the )?|(?:the )?)weather(?: (?:looking like|right now|today))?(?: (?:in|for|at) (.+))?$/i);
  if (!match) return null;
  const place = match[1]?.trim();
  const currentLocation = !!place && /^(?:my (?:current )?location|current location|here)$/i.test(place);
  return { currentLocation, ...(place && !currentLocation ? { city: place } : {}), ...(unit ? { unit } : {}) };
}
export function weatherReply(weather: WeatherSnapshot) {
  const degree = weather.unit === "celsius" ? "°C" : "°F";
  const label = /^Goldsboro, North Carolina/i.test(weather.location) ? "Goldsboro, North Carolina" : weather.location;
  const metrics = [`In ${label}, ${weather.description.toLowerCase()} and ${weather.temperature}${degree} — feels like ${weather.feelsLike}${degree}.`];
  const outlook = [];
  if (weather.high !== null && weather.high !== undefined) outlook.push(`high ${weather.high}${degree}`);
  if (weather.low !== null && weather.low !== undefined) outlook.push(`low ${weather.low}${degree}`);
  if (weather.rainChance !== null && weather.rainChance !== undefined) outlook.push(`${weather.rainChance}% precipitation chance today`);
  if (weather.precipitation !== null && weather.precipitation !== undefined) outlook.push(`${weather.precipitation} mm current precipitation`);
  if (weather.windSpeed !== null && weather.windSpeed !== undefined) outlook.push(`wind ${weather.windSpeed} mph`);
  if (outlook.length) metrics.push(`Today: ${outlook.join(", ")}.`);
  return `${metrics.join(" ")} Source: ${weather.source}; updated ${new Date(weather.retrievedAt).toLocaleString("en-US")}.`;
}
