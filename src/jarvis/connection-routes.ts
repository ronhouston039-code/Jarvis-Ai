import type { Hono } from "hono";
import { createUserToolExecutor, resolveAppMembership } from "deepspace/worker";
import type { AppContext } from "../../worker";
import { resolveAuth } from "../server/http-routes";
import {
  locationInput,
  shortcutInput,
  currentWeather,
  onlineSearch,
  currentNews,
} from "./connections";
import { z } from "zod";
export function registerConnectionRoutes(app: Hono<AppContext>) {
  app.use("/api/jarvis/connections/*", async (c, next) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const membership = await resolveAppMembership(
      c.env,
      auth.userId,
      c.req.raw.signal,
    );
    if (!membership?.member) return c.json({ error: "forbidden" }, 403);
    return next();
  });
  for (const [path, collection, schema] of [
    ["location", "locations", locationInput],
    ["devices", "device-shortcuts", shortcutInput],
  ] as const) {
    app.post(`/api/jarvis/connections/${path}`, async (c) => {
      const auth = (await resolveAuth(c.req.raw, c.env))!;
      const parsed = schema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
      const execute = createUserToolExecutor(
        c.env,
        auth.userId,
        c.req.raw.signal,
      );
      const found =
        path === "location"
          ? ((await execute("records.query", {
              collection,
              where: { userId: auth.userId },
              limit: 1,
            })) as { data?: { records?: { recordId: string }[] } })
          : null;
      const record = found?.data?.records?.[0];
      const result = (await execute(
        record ? "records.update" : "records.create",
        {
          collection,
          ...(record ? { recordId: record.recordId } : {}),
          data: parsed.data,
        },
      )) as { success: boolean };
      return c.json(result, result.success ? 200 : 403);
    });
  }
  app.post("/api/jarvis/connections/disable", async (c) => {
    const parsed = z
      .object({
        collection: z.enum(["locations", "device-shortcuts"]),
        recordId: z.string().min(1).max(200),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
    const auth = (await resolveAuth(c.req.raw, c.env))!;
    const execute = createUserToolExecutor(
      c.env,
      auth.userId,
      c.req.raw.signal,
    );
    const existing = (await execute("records.get", parsed.data)) as {
      success: boolean;
      data?: { record?: { data?: { userId?: string } } };
    };
    if (
      !existing.success ||
      existing.data?.record?.data?.userId !== auth.userId
    )
      return c.json({ error: "not_found" }, 404);
    const result = (await execute("records.update", {
      ...parsed.data,
      data:
        parsed.data.collection === "locations"
          ? { enabled: 0, label: "", latitude: 0, longitude: 0 }
          : { enabled: 0, name: "", onShortcut: "", offShortcut: "" },
    })) as { success: boolean };
    return c.json(result, result.success ? 200 : 403);
  });
  app.get("/api/jarvis/connections/weather", async (c) => {
    const auth = (await resolveAuth(c.req.raw, c.env))!;
    const execute = createUserToolExecutor(
      c.env,
      auth.userId,
      c.req.raw.signal,
    );
    const found = (await execute("records.query", {
      collection: "locations",
      where: { userId: auth.userId, enabled: 1 },
      limit: 1,
    })) as { success: boolean; data?: { records?: { data: unknown }[] } };
    const data = found.data?.records?.[0]?.data as
      Record<string, unknown> | undefined;
    const location = locationInput.safeParse(
      data
        ? {
            label: data.label,
            latitude: data.latitude,
            longitude: data.longitude,
            enabled: 1,
          }
        : null,
    );
    if (!location.success) return c.json({ error: "location_required" }, 409);
    try {
      return c.json(
        await currentWeather(location.data.latitude, location.data.longitude),
      );
    } catch {
      return c.json({ error: "weather_unavailable" }, 502);
    }
  });
  app.get("/api/jarvis/connections/search", async (c) => {
    const query = z.string().min(1).max(300).safeParse(c.req.query("q"));
    if (!query.success) return c.json({ error: "invalid_query" }, 422);
    try {
      return c.json(await onlineSearch(query.data));
    } catch {
      return c.json({ error: "search_unavailable" }, 502);
    }
  });
  app.get("/api/jarvis/connections/news", async (c) => {
    try {
      return c.json(await currentNews());
    } catch {
      return c.json({ error: "news_unavailable" }, 502);
    }
  });
}
