import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { tavilySearch } from "./search";
import { normalizeSearch, publicSourceUrl, searchRequestSchema } from "./search-contracts";
const fixture = { answer: "A sourced answer.", results: [
  { title: "One", url: "https://example.org/article", content: "Source content", published_date: "2026-10-05" },
  { title: "Two", url: "https://example.com/story" },
] };
afterEach(() => vi.useRealTimers());
it("uses fixed authenticated server destination and bounded provider request", async () => {
  const fetcher = vi.fn(async () => Response.json(fixture));
  const result = await tavilySearch("historical research", "unit-test-value", new AbortController().signal, fetcher);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.tavily.com/search");
  expect(options.headers).toMatchObject({ Authorization: "Bearer unit-test-value" });
  expect(JSON.parse(options.body as string)).toMatchObject({ max_results: 5, include_answer: true, include_raw_content: false });
  expect(result.sources).toHaveLength(2); expect(result.sources[0].date).toBe("2026-10-05");
  expect(JSON.stringify(result)).not.toContain("unit-test-value");
});
it("rejects credential-bearing/private/unsafe source links without inventing replacements", () => {
  for (const url of ["javascript:alert(1)", "http://192.168.1.89", "http://localhost", "https://user:pass@example.com", "https://example.com?apiKey=hidden", "https://example.com?token=hidden", "http://[::1]"]) expect(publicSourceUrl(url)).toBeNull();
  expect(() => normalizeSearch({ results: [{ url: "javascript:foo", title: "Unsafe" }] })).toThrow("search_unavailable");
  expect(() => normalizeSearch({ results: {} })).toThrow("search_unavailable");
});
it("bounds sources, removes duplicates, preserves real domain and does not invent dates", () => {
  const result = normalizeSearch({ results: [...fixture.results, ...fixture.results] });
  expect(result.sources).toHaveLength(2); expect(result.sources[1]).not.toHaveProperty("date");
  expect(result.answer).toBe("Source excerpt: Source content");
  expect(result.sources[0].domain).toBe("example.org");
});
it("rejects malformed and credential-bearing query input", () => {
  for (const input of [{ query: "x" }, { query: "x".repeat(301) }, { query: "research", url: "http://local" }, { query: "password = privatecredential" }]) expect(searchRequestSchema.safeParse(input).success).toBe(false);
});
it("provider failures do not surface raw errors or retry", async () => {
  const fetcher = vi.fn(async () => new Response("private-provider-body", { status: 429 }));
  await expect(tavilySearch("research", "unit-test-value", new AbortController().signal, fetcher)).rejects.toThrow("search_unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("intentional abort propagates to the provider without retry", async () => {
  const controller = new AbortController(); controller.abort("background");
  const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => { expect(options?.signal?.aborted).toBe(true); throw new DOMException("Cancelled", "AbortError"); });
  await expect(tavilySearch("research", "unit-test-value", controller.signal, fetcher)).rejects.toThrow("Cancelled"); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("ten-second provider timeout aborts pending work", async () => {
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")), { once: true }); });
  // Native AbortSignal.timeout is tested with a bounded fast stand-in.
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => { const c = new AbortController(); setTimeout(() => c.abort(), 5); return c.signal; });
  await expect(tavilySearch("research", "unit-test-value", new AbortController().signal, fetcher)).rejects.toThrow("Timed out");
  expect(timeout).toHaveBeenCalledWith(10000); timeout.mockRestore();
});
it("secret name and provider fetch remain outside client modules", () => {
  for (const file of ["src/components/JarvisChat.tsx", "src/components/WebSearchSettings.tsx", "src/components/WebSearchResults.tsx", "src/jarvis/search-contracts.ts"]) {
    const source = readFileSync(file, "utf8"); expect(source).not.toContain("TAVILY_API_KEY"); expect(source).not.toContain("https://api.tavily.com"); expect(source).not.toContain('from "../jarvis/search"');
  }
});
