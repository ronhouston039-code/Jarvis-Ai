import { expect, it } from "vitest";
import { weatherIntent, weatherReply } from "./weather-intent";
it("recognizes supported simple weather questions without intercepting compound tasks", () => {
  for (const message of ["What's the weather?", "Weather right now", "How is the weather today?", "Jarvis, what's the weather?"]) expect(weatherIntent(message)).toEqual({ currentLocation: false });
  expect(weatherIntent("What's the weather in my location?")).toEqual({ currentLocation: true });
  expect(weatherIntent("Weather in London in Celsius")).toEqual({ currentLocation: false, city: "London", unit: "celsius" });
  expect(weatherIntent("Check tomorrow's weather and remind me if it rains")).toBeNull();
  expect(weatherIntent("Turn off the TV")).toBeNull();
});
it("formats only supported weather evidence with the required default prefix and units", () => {
  const text = weatherReply({ location: "Goldsboro, North Carolina", approximate: true, temperature: 70, feelsLike: 68, condition: "Clear", description: "Clear", humidity: null, windSpeed: null, high: null, low: null, retrievedAt: "2026-10-05T12:00:00Z", source: "Open-Meteo", forecast: [] });
  expect(text).toMatch(/^In Goldsboro, North Carolina/);
  expect(text).toContain("70°F"); expect(text).toContain("Open-Meteo");
  expect(text).not.toMatch(/wind|chance|high|low/);
});
