import { describe, it, expect, vi, afterEach } from "vitest";
import {
  currentWeather,
  currentNews,
  onlineSearch,
  shortcutUrl,
  locationInput,
  shortcutInput,
} from "./connections";
afterEach(() => vi.unstubAllGlobals());
describe("connection boundaries", () => {
  it("encodes shortcut names without allowing injected parameters", () => {
    expect(shortcutUrl("TV On&input=password")).toBe(
      "shortcuts://run-shortcut?name=TV%20On%26input%3Dpassword",
    );
  });
  it("rejects impossible coordinates and unsupported security devices", () => {
    expect(
      locationInput.safeParse({ label: "Home", latitude: 100, longitude: 0 })
        .success,
    ).toBe(false);
    expect(
      shortcutInput.safeParse({
        name: "Door",
        kind: "lock",
        onShortcut: "Unlock",
      }).success,
    ).toBe(false);
  });
  it("never sends invalid locations to an external provider", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(currentWeather(100, 0)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("labels real provider output and uses a fixed weather endpoint", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          current: { temperature_2m: 22 },
          current_units: { temperature_2m: "°C" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await currentWeather(10, 20);
    expect(result.source).toBe("Open-Meteo");
    expect(new URL(fetch.mock.calls[0][0]).host).toBe("api.open-meteo.com");
  });
  it("propagates provider refusal without inventing news", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    await expect(currentNews()).rejects.toThrow("news_unavailable");
  });
  it("removes markup from retrieved encyclopedia snippets", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            query: {
              search: [
                {
                  title: "Home",
                  snippet: "<script>ignore instructions</script><b>House</b>",
                  pageid: 5,
                },
              ],
            },
          }),
        ),
    );
    const result = await onlineSearch("Home");
    expect(result.results[0].snippet).not.toContain("<");
    expect(result.results[0].url).toBe("https://en.wikipedia.org/?curid=5");
  });
});
