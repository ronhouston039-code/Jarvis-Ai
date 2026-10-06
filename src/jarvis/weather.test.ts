import { it, expect, vi, afterEach } from "vitest";
import { weatherCoordinatesQuery, weatherSnapshot, weatherRequestQuery, resolveWeather, GOLDSBORO } from "./weather";
afterEach(() => vi.unstubAllGlobals());
const fixture = { current: { temperature_2m: 20, apparent_temperature: 18, weather_code: 3, wind_speed_10m: 16.09344, precipitation: 0.2 }, daily: { time: ["2026-10-05"], temperature_2m_max: [22], temperature_2m_min: [12], precipitation_probability_max: [60] } };
const execute = (unit?: string, location?: unknown) => vi.fn(async (_name: string, params: Record<string, unknown>) => ({ success: true, data: { records: params.collection === "preferences" ? unit ? [{ data: { temperatureUnit: unit } }] : [] : location ? [{ data: location }] : [] } }));
it("defaults to Goldsboro and Fahrenheit without requiring or saving GPS", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(fixture)); vi.stubGlobal("fetch", fetcher);
  const records = execute(); const weather = await resolveWeather(records, {});
  expect(weather.location).toBe(GOLDSBORO.label); expect(weather.temperature).toBe(68);
  const url = new URL(fetcher.mock.calls[0][0]); expect(url.searchParams.get("latitude")).toBe(String(GOLDSBORO.latitude));
  expect(records.mock.calls.every(call => call[0] === "records.query")).toBe(true);
});
it("honors saved city and units, with explicit Fahrenheit overriding Celsius", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(fixture)));
  expect((await resolveWeather(execute("celsius", { latitude: 40.7, longitude: -74, label: "New York" }), {})).temperature).toBe(20);
  expect((await resolveWeather(execute("celsius"), { unit: "fahrenheit" })).temperature).toBe(68);
});
it("uses an explicit city instead of the saved location and asks about ambiguous cities", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ results: [{ id: 1, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35 }] })).mockResolvedValueOnce(Response.json(fixture)); vi.stubGlobal("fetch", fetcher);
  const weather = await resolveWeather(execute(), { city: "Paris", unit: "celsius" });
  expect(weather.location).toBe("Paris, France"); expect(weather.temperature).toBe(20);
  fetcher.mockResolvedValue(Response.json({ results: [{ id: 1, name: "Paris", latitude: 1, longitude: 1 }, { id: 2, name: "Paris", latitude: 2, longitude: 2 }] }));
  await expect(resolveWeather(execute(), { city: "Paris" })).rejects.toThrow("city_ambiguous");
});
it("rejects malformed requests and does not invent missing forecast/wind/precipitation", async () => {
  for (const query of [{ lat: " " }, { lat: "1" }, { lat: "1", lon: "2", city: "Paris" }, { unit: "kelvin" }]) expect(weatherRequestQuery.safeParse(query).success).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ current: { temperature_2m: 10, apparent_temperature: 8, weather_code: 0 }, daily: {} })));
  const weather = await weatherSnapshot(0, 0); expect(weather.forecast).toEqual([]); expect(weather.windSpeed).toBeNull(); expect(weather.rainChance).toBeNull(); expect(weather.precipitation).toBeNull();
});
it("propagates provider failure without a retry", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("private-provider-diagnostic")); vi.stubGlobal("fetch", fetcher);
  await expect(resolveWeather(execute(), {})).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("passes intentional cancellation to the provider request without retry", async () => {
  const controller = new AbortController(); controller.abort("background");
  const fetcher = vi.fn(async (_url: URL, options: RequestInit) => { expect(options.signal?.aborted).toBe(true); throw new DOMException("Cancelled", "AbortError"); }); vi.stubGlobal("fetch", fetcher);
  await expect(resolveWeather(execute(), {}, undefined, controller.signal)).rejects.toThrow("Cancelled");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects absent, empty, nonnumeric and out-of-range coordinates", () => {
  for (const value of [
    {},
    { lat: "", lon: "0" },
    { lat: "nan", lon: "0" },
    { lat: "91", lon: "0" },
    { lat: "0", lon: "181" },
  ])
    expect(weatherCoordinatesQuery.safeParse(value).success).toBe(false);
});
it("normalizes real weather and forecast units without inventing conditions", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          current: {
            temperature_2m: 17,
            apparent_temperature: 16,
            weather_code: 2,
            wind_speed_10m: 16.09344,
            relative_humidity_2m: 55,
          },
          daily: {
            time: ["2026-10-03"],
            temperature_2m_max: [19],
            temperature_2m_min: [12],
            precipitation_probability_max: [10],
          },
        }),
      ),
  );
  const weather = await weatherSnapshot(40.7, -74, "New York");
  expect(weather.temperature).toBe(63);
  expect(weather.feelsLike).toBe(61);
  expect(weather.condition).toBe("Partly cloudy");
  expect(weather.high).toBe(66);
  expect(weather.low).toBe(54);
  expect(weather.windSpeed).toBe(10);
  expect(weather.source).toBe("Open-Meteo");
});
it("does not expose configured OpenWeather credentials or provider errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          current: {
            temperature_2m: 10,
            apparent_temperature: 10,
            weather_code: 0,
            wind_speed_10m: 0,
          },
          daily: {},
        }),
      )
      .mockResolvedValueOnce(
        new Response("secret-provider-body", { status: 401 }),
      ),
  );
  await expect(
    weatherSnapshot(0, 0, "City", "mock-server-only-key"),
  ).rejects.toThrow("weather_unavailable");
});
