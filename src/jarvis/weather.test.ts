import { it, expect, vi, afterEach } from "vitest";
import { weatherCoordinatesQuery, weatherSnapshot } from "./weather";
afterEach(() => vi.unstubAllGlobals());
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
