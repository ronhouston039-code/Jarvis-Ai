import { startupAudio } from "./startup-audio";
import { usesOwnerGroq } from "../ai/groq";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { resolveAppMembership, createUserToolExecutor } from "deepspace/worker";
import { z } from "zod";
import type { AppContext } from "../../worker";
import { resolveAuth, resolveAgentAuth } from "../server/http-routes";
import { memorySchema, reminderSchema, deletionSchema } from "./contracts";

export function registerJarvisRoutes(app: Hono<AppContext>) {
  app.get("/api/health", (c) =>
    c.json({ status: "ok", assistant: "JARVIS", version: "1.0.0" }),
  );
  app.get("/api/ready", async (c) => {
    const result = (await createUserToolExecutor(
      c.env,
      c.env.OWNER_USER_ID,
      c.req.raw.signal,
    )("records.query", { collection: "users", limit: 1 })) as {
      success: boolean;
    };
    return c.json(
      { status: result.success ? "ready" : "unavailable" },
      result.success ? 200 : 503,
    );
  });

  app.use(
    "/api/ai/*",
    bodyLimit({
      maxSize: 128000,
      onError: (c) => c.json({ error: "request_too_large" }, 413),
    }),
  );
  for (const prefix of ["/api/ai/*", "/api/jarvis/*", "/_deepspace/agent/*"])
    app.use(prefix, async (c, next) => {
      if (c.req.method !== "POST" && c.req.method !== "PATCH") return next();
      const auth = await (
        c.req.path.startsWith("/_deepspace/agent/")
          ? resolveAgentAuth
          : resolveAuth
      )(c.req.raw, c.env);
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const voice = c.req.path.includes("/voice/");
      const stub = c.env.CONFIRMATIONS.get(
        c.env.CONFIRMATIONS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`),
      );
      const result = await stub.fetch(
        new Request("https://internal/rate", {
          method: "POST",
          body: JSON.stringify({
            userId: auth.userId,
            operation: "rate",
            bucket: voice ? "voice" : "actions",
            limit: voice ? 5 : 30,
          }),
        }),
      );
      if (!result.ok) return result;
      return next();
    });
  app.use(
    "/api/jarvis/*",
    bodyLimit({
      maxSize: 2_000_000,
      onError: (c) => c.json({ error: "request_too_large" }, 413),
    }),
  );
  app.post("/api/jarvis/preferences", async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const parsed = z
      .object({
        timezone: z
          .string()
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }),
        responseMode: z.enum(["normal", "brief", "technical"]),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
    const execute = createUserToolExecutor(
      c.env,
      auth.userId,
      c.req.raw.signal,
    );
    const found = (await execute("records.query", {
      collection: "preferences",
      where: { userId: auth.userId },
      limit: 1,
    })) as { success: boolean; data?: { records?: { recordId: string }[] } };
    if (!found.success) return c.json({ error: "forbidden" }, 403);
    const record = found.data?.records?.[0];
    const result = (await execute(
      record ? "records.update" : "records.create",
      {
        collection: "preferences",
        ...(record ? { recordId: record.recordId } : {}),
        data: parsed.data,
      },
    )) as { success: boolean };
    return c.json(result, result.success ? 200 : 403);
  });
  app.get("/api/jarvis/capabilities", async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    return c.json({
      llmMode: usesOwnerGroq(c.env, auth.userId) ? "groq" : "deepspace",
      chat: !usesOwnerGroq(c.env, auth.userId) || !!c.env.GROQ_API_KEY,
      reminders: true,
      memories: true,
      serverTranscription:
        !!c.env.GROQ_API_KEY && auth.userId === c.env.OWNER_USER_ID,
      fishVoice:
        !!c.env.VOICE_API_KEY &&
        !!c.env.VOICE_ID &&
        auth.userId === c.env.OWNER_USER_ID,
      integrations: {
        weather: false,
        calendar: false,
        email: false,
        music: false,
        smartHome: false,
      },
    });
  });
  for (const [path, schema, collection] of [
    ["reminders", reminderSchema, "reminders"],
    ["memories", memorySchema, "memories"],
  ] as const) {
    app.post(`/api/jarvis/${path}`, async (c) => {
      const auth = await resolveAuth(c.req.raw, c.env);
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const member = await resolveAppMembership(
        c.env,
        auth.userId,
        c.req.raw.signal,
      );
      if (!member?.member) return c.json({ error: "forbidden" }, 403);
      const parsed = schema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
      const data = { ...parsed.data } as Record<string, unknown>;
      if (typeof data.dueAt === "string")
        data.dueAt = new Date(data.dueAt).toISOString();
      const result = (await createUserToolExecutor(
        c.env,
        auth.userId,
        c.req.raw.signal,
      )("records.create", { collection, data })) as { success: boolean };
      return c.json(result, result.success ? 201 : 403);
    });
  }
  for (const operation of ["request", "approve"]) {
    app.post(`/api/jarvis/confirmations/${operation}`, async (c) => {
      const auth = await resolveAuth(c.req.raw, c.env);
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const member = await resolveAppMembership(
        c.env,
        auth.userId,
        c.req.raw.signal,
      );
      if (!member?.member) return c.json({ error: "forbidden" }, 403);
      const body = await c.req.json().catch(() => null);
      const parsed =
        operation === "request"
          ? deletionSchema.safeParse(body)
          : z
              .object({ token: z.string().min(20).max(100) })
              .strict()
              .safeParse(body);
      if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
      const stub = c.env.CONFIRMATIONS.get(
        c.env.CONFIRMATIONS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`),
      );
      return stub.fetch(
        new Request("https://internal/confirmation", {
          method: "POST",
          body: JSON.stringify({
            userId: auth.userId,
            operation,
            ...(operation === "request"
              ? { action: parsed.data }
              : parsed.data),
          }),
        }),
      );
    });
  }
  app.post("/api/jarvis/voice/transcribe", async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (auth.userId !== c.env.OWNER_USER_ID)
      return c.json({ error: "owner_voice_only" }, 403);
    if (!c.env.GROQ_API_KEY)
      return c.json({ error: "transcription_not_connected" }, 409);
    const form = await c.req.formData();
    const file = form.get("audio");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 1_800_000 ||
      ![
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
      ].includes(file.type.split(";")[0])
    )
      return c.json({ error: "invalid_audio" }, 422);
    const upload = new FormData();
    upload.append("file", file, file.name);
    upload.append("model", "whisper-large-v3-turbo");
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.env.GROQ_API_KEY}`,
            "User-Agent": "JARVIS/1.0",
          },
          body: upload,
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        return c.json({ error: "transcription_unavailable" }, 502);
      const data = (await response.json()) as { text?: string };
      return c.json({ transcript: data.text?.slice(0, 16000) ?? "" });
    } catch {
      return c.json({ error: "transcription_unavailable" }, 502);
    }
  });
  app.get("/api/jarvis/voice/greeting", async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (auth.userId !== c.env.OWNER_USER_ID)
      return c.json({ error: "owner_voice_only" }, 403);
    const audio = Uint8Array.from(atob(startupAudio), (char) => char.charCodeAt(0));
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  });
  app.post("/api/jarvis/voice/speak", async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env);
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (auth.userId !== c.env.OWNER_USER_ID)
      return c.json({ error: "owner_voice_only" }, 403);
    if (!c.env.VOICE_API_KEY || !c.env.VOICE_ID)
      return c.json({ error: "fish_voice_not_connected" }, 409);
    const parsed = z
      .object({ text: z.string().min(1).max(4000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_fields" }, 422);
    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.VOICE_API_KEY}`,
          "Content-Type": "application/json",
          model: "s1",
          "User-Agent": "JARVIS/1.0",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          reference_id: c.env.VOICE_ID,
          format: "mp3",
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 402)
        return c.json({ error: "speech_credits_required" }, 402);
      if (response.status === 401 || response.status === 403)
        return c.json({ error: "speech_access_denied" }, 502);
      if (!response.ok) return c.json({ error: "speech_unavailable" }, 502);
      return new Response(response.body, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      });
    } catch {
      return c.json({ error: "speech_unavailable" }, 502);
    }
  });
}
