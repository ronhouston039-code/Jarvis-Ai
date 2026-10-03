import { rokuAction } from "./roku";
import { musicLinkInput } from "./music-links";
import { weatherSnapshot, findCities } from "./weather";
import { usableAppleMusicToken } from "./apple-music-config";
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
  for (const [suffix, operation] of [
    ["status", "roku_execute"],
    ["action", "roku_execute"],
    ["power/request", "roku_power_request"],
    ["power/approve", "roku_power_approve"],
    ["power/cancel", "roku_power_cancel"],
    ["disconnect", "roku_disconnect"],
    ["connect", "roku_connect"],
  ] as const) {
    const handler = async (c: import("hono").Context<AppContext>) => {
      const auth = (await resolveAuth(c.req.raw, c.env))!;
      if (auth.userId !== c.env.OWNER_USER_ID)
        return c.json({ error: "owner_roku_only" }, 403);
      const body =
        suffix === "status"
          ? { tool: "roku_get_status" }
          : await c.req.json().catch(() => null);
      if (
        ["power/request", "connect", "disconnect"].includes(suffix) &&
        !z.object({}).strict().safeParse(body).success
      )
        return c.json({ error: "invalid_fields" }, 422);
      if (suffix === "action" && !rokuAction.safeParse(body).success)
        return c.json({ error: "invalid_roku_action" }, 422);
      if (
        (suffix === "power/approve" || suffix === "power/cancel") &&
        !z
          .object({ token: z.string().min(1).max(100) })
          .strict()
          .safeParse(body).success
      )
        return c.json({ error: "invalid_fields" }, 422);
      return c.env.CONFIRMATIONS.get(
        c.env.CONFIRMATIONS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`),
      ).fetch(
        new Request("https://internal/roku", {
          method: "POST",
          body: JSON.stringify({
            userId: auth.userId,
            operation,
            ...(suffix === "power/approve" || suffix === "power/cancel"
              ? { token: body.token }
              : { action: body }),
          }),
        }),
      );
    };
    if (suffix === "status")
      app.get(`/api/jarvis/connections/roku/${suffix}`, handler);
    else app.post(`/api/jarvis/connections/roku/${suffix}`, handler);
  }
  app.get("/api/jarvis/connections/apple-music/config", async (c) => {
    const auth = (await resolveAuth(c.req.raw, c.env))!;
    if (auth.userId !== c.env.OWNER_USER_ID)
      return c.json({ available: false, reason: "owner_music_only" });
    // This short-lived MusicKit developer JWT is intentionally consumed by Apple's browser SDK.
    // The Apple signing private key must never be placed in this response or in the frontend.
    const token = c.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    c.header("Cache-Control", "no-store");
    return c.json(
      usableAppleMusicToken(token)
        ? { available: true, developerToken: token }
        : { available: false, reason: "music_developer_token_required" },
    );
  });
  for (const [path, collection, schema] of [
    ["location", "locations", locationInput],
    ["devices", "device-shortcuts", shortcutInput],
    ["music-links", "music-links", musicLinkInput],
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
        path === "location" || path === "music-links"
          ? ((await execute("records.query", {
              collection,
              where: {
                userId: auth.userId,
                ...("preset" in parsed.data
                  ? { preset: parsed.data.preset }
                  : {}),
              },
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
        collection: z.enum(["locations", "device-shortcuts", "music-links"]),
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
          : parsed.data.collection === "music-links"
            ? { enabled: 0, label: "", url: "" }
            : { enabled: 0, name: "", onShortcut: "", offShortcut: "" },
    })) as { success: boolean };
    return c.json(result, result.success ? 200 : 403);
  });
  app.get("/api/jarvis/connections/cities", async (c) => {
    const query = z.string().trim().min(2).max(120).safeParse(c.req.query("q"));
    if (!query.success) return c.json({ error: "invalid_query" }, 422);
    try {
      return c.json(await findCities(query.data));
    } catch {
      return c.json({ error: "city_search_unavailable" }, 502);
    }
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
      | Record<string, unknown>
      | undefined;
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
        await weatherSnapshot(
          location.data.latitude,
          location.data.longitude,
          location.data.label,
          c.env.OPENWEATHER_API_KEY,
        ),
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
