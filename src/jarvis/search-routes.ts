import type { Hono } from "hono";
import type { AppContext } from "../../worker";
import { resolveAuth } from "../server/http-routes";
import { createUserToolExecutor, resolveAppMembership } from "deepspace/worker";
import { searchMessages, searchRequestSchema } from "./search-contracts";
import { tavilySearch } from "./search";

export function registerSearchRoutes(app: Hono<AppContext>) {
  app.use("/api/jarvis/search*", async (c, next) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (!(await resolveAppMembership(c.env, auth.userId, c.req.raw.signal))?.member) return c.json({ error: "forbidden" }, 403);
    return next();
  });
  app.get("/api/jarvis/search/config", c => c.json({ configured: Boolean(c.env.TAVILY_API_KEY?.trim()) }));
  app.post("/api/jarvis/search", async c => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const parsed = searchRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
    const execute = createUserToolExecutor(c.env, auth.userId, c.req.raw.signal);
    const prefs = await execute("records.query", { collection: "preferences", limit: 1 }) as { success: boolean; data?: { records?: { data: { liveWebSearch?: number | boolean } }[] } };
    if (!prefs.success) return c.json({ error: "forbidden" }, 403);
    const enabled = prefs.data?.records?.[0]?.data.liveWebSearch;
    if (enabled === false || enabled === 0) return c.json({ error: "search_disabled", message: searchMessages.search_disabled }, 409);
    if (!c.env.TAVILY_API_KEY?.trim()) return c.json({ error: "search_not_connected", message: searchMessages.search_not_connected }, 409);
    const stub = c.env.CONFIRMATIONS.get(c.env.CONFIRMATIONS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`));
    const quota = await stub.fetch(new Request("https://internal/rate", { method: "POST", body: JSON.stringify({ userId: auth.userId, operation: "rate", bucket: "web_search", limit: 10 }) }));
    if (!quota.ok) return c.json({ error: "search_unavailable", message: searchMessages.search_unavailable }, 429);
    try { return c.json(await tavilySearch(parsed.data.query, c.env.TAVILY_API_KEY, c.req.raw.signal)); }
    catch {
      if (c.req.raw.signal.aborted) return Response.json({ error: "cancelled" }, { status: 499 });
      return c.json({ error: "search_unavailable", message: searchMessages.search_unavailable }, 502);
    }
  });
}
