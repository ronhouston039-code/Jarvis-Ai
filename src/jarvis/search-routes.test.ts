import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppContext, Env } from "../../worker";
const mock = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), execute: vi.fn(), search: vi.fn(), rate: vi.fn() }));
vi.mock("../server/http-routes", () => ({ resolveAuth: mock.auth }));
vi.mock("deepspace/worker", () => ({ resolveAppMembership: mock.member, createUserToolExecutor: (_env: unknown, userId: string, signal: AbortSignal) => { expect(userId).toBe("user-a"); expect(signal).toBeInstanceOf(AbortSignal); return mock.execute; } }));
vi.mock("./search", () => ({ tavilySearch: mock.search }));
import { registerSearchRoutes } from "./search-routes";
const app = new Hono<AppContext>(); registerSearchRoutes(app);
const env = { DEEPSPACE_APP_ID: "test-app", TAVILY_API_KEY: "unit-test-value", CONFIRMATIONS: { idFromName: vi.fn(), get: () => ({ fetch: mock.rate }) } } as unknown as Env;
const request = (body: unknown = { query: "Who invented the telephone?" }, custom = env) => app.request("/api/jarvis/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, custom);
beforeEach(() => { vi.clearAllMocks(); mock.auth.mockResolvedValue({ userId: "user-a" }); mock.member.mockResolvedValue({ member: true }); mock.execute.mockResolvedValue({ success: true, data: { records: [] } }); mock.rate.mockResolvedValue(new Response(null, { status: 200 })); mock.search.mockResolvedValue({ label: "Live web results", answer: "Real provider answer", sources: [{ title: "A", url: "https://example.org", domain: "example.org" }, { title: "B", url: "https://example.com", domain: "example.com" }] }); });
it("requires authentication and membership", async () => {
  mock.auth.mockResolvedValue(null); expect((await request()).status).toBe(401);
  mock.auth.mockResolvedValue({ userId: "user-a" }); mock.member.mockResolvedValue({ member: false }); expect((await request()).status).toBe(403);
  expect(mock.search).not.toHaveBeenCalled();
});
it("missing key reports only sanitized not-connected status", async () => {
  const response = await request(undefined, { ...env, TAVILY_API_KEY: undefined }); expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "search_not_connected", message: "Live web search is not connected yet." }); expect(mock.search).not.toHaveBeenCalled();
});
it("disabled saved preference forbids provider work even with configured key", async () => {
  mock.execute.mockResolvedValue({ success: true, data: { records: [{ data: { liveWebSearch: 0 } }] } });
  expect(await (await request()).json()).toEqual({ error: "search_disabled", message: "Live web search is turned off." }); expect(mock.search).not.toHaveBeenCalled();
});
it("failed preference authorization cannot enable search", async () => { mock.execute.mockResolvedValue({ success: false }); expect((await request()).status).toBe(403); expect(mock.search).not.toHaveBeenCalled(); });
it("rate limit blocks requests without raw diagnostic exposure", async () => {
  mock.rate.mockResolvedValue(new Response("private-limiter-detail", { status: 429 })); const response = await request(); expect(response.status).toBe(429); expect(await response.text()).not.toContain("private-limiter-detail"); expect(mock.search).not.toHaveBeenCalled();
});
it("valid requests use caller-bound preferences, fixed rate bucket and server secret", async () => {
  const response = await request(); expect(response.status).toBe(200); expect(mock.execute).toHaveBeenCalledWith("records.query", { collection: "preferences", limit: 1 });
  const rateRequest = mock.rate.mock.calls[0][0] as Request; expect(await rateRequest.json()).toMatchObject({ userId: "user-a", bucket: "web_search", limit: 10 });
  expect(mock.search.mock.calls[0][1]).toBe("unit-test-value"); expect(await response.text()).not.toContain("unit-test-value");
});
it("validation rejects arbitrary targets and provider failures are sanitized", async () => {
  expect((await request({ query: "research", url: "https://private" })).status).toBe(422);
  mock.search.mockRejectedValue(new Error("private-provider-secret")); const response = await request(); expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "search_unavailable", message: "Live web search is temporarily unavailable." });
});
it("configuration returns boolean only", async () => { const response = await app.request("/api/jarvis/search/config", {}, env); expect(await response.json()).toEqual({ configured: true }); });

it("intentional request cancellation is not classified as provider failure", async () => {
  const controller = new AbortController();
  mock.search.mockImplementation(async () => { controller.abort("stop"); throw new DOMException("Cancelled", "AbortError"); });
  const response = await app.request(new Request("http://localhost/api/jarvis/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "public research" }), signal: controller.signal }), {}, env);
  expect(response.status).toBe(499); expect(await response.json()).toEqual({ error: "cancelled" });
});
