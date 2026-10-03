import {
  nativeAuditSchema,
  nativeAuditKey,
  localManifestSchema,
  localRequestSchema,
} from "./native-home-audit";
import type { Env } from "../../worker";
type RequestBody = {
  userId: string;
  operation: string;
  action?: unknown;
  token?: string;
};
export function handleNativeHome(sql: SqlStorage, body: RequestBody): Response {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS native_home_audits(user_id TEXT NOT NULL,id TEXT NOT NULL,event TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(user_id,id))",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS native_home_manifest(user_id TEXT PRIMARY KEY,actions TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS native_home_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,action_id TEXT NOT NULL,expires INTEGER NOT NULL,claimed INTEGER NOT NULL DEFAULT 0)",
  );
  const now = Date.now();
  sql.exec(
    "DELETE FROM native_home_audits WHERE received<?",
    now - 90 * 86400000,
  );
  sql.exec("DELETE FROM native_home_requests WHERE expires<?", now);
  if (body.operation === "native_home_audits") {
    const rows = sql
      .exec<{
        id: string;
        event: string;
      }>("SELECT id,event FROM native_home_audits WHERE user_id=? ORDER BY received DESC LIMIT 100", body.userId)
      .toArray();
    return Response.json({
      events: rows.map((r) => ({
        id: r.id,
        ...JSON.parse(r.event),
        source: "native_client_reported",
      })),
    });
  }
  if (body.operation === "native_home_clear") {
    sql.exec("DELETE FROM native_home_audits WHERE user_id=?", body.userId);
    return Response.json({ status: "cleared" });
  }
  if (body.operation === "native_home_audit") {
    const input = nativeAuditSchema.safeParse(body.action);
    const key = nativeAuditKey.safeParse(body.token);
    if (!input.success || !key.success)
      return Response.json({ error: "invalid_audit" }, { status: 422 });
    const existing = sql
      .exec<{
        event: string;
      }>("SELECT event FROM native_home_audits WHERE user_id=? AND id=?", body.userId, key.data)
      .toArray()[0];
    const event = JSON.stringify(input.data);
    if (existing && existing.event !== event)
      return Response.json({ error: "audit_id_conflict" }, { status: 409 });
    sql.exec(
      "INSERT OR IGNORE INTO native_home_audits VALUES(?,?,?,?)",
      body.userId,
      key.data,
      event,
      now,
    );
    return Response.json({
      status: "recorded",
      source: "native_client_reported",
    });
  }
  if (body.operation === "native_home_manifest") {
    const input = localManifestSchema.safeParse(body.action);
    if (!input.success)
      return Response.json({ error: "invalid_local_actions" }, { status: 422 });
    sql.exec(
      "INSERT OR REPLACE INTO native_home_manifest VALUES(?,?)",
      body.userId,
      JSON.stringify(input.data.actions),
    );
    // Replacing or disabling a manifest invalidates every outstanding request.
    sql.exec("DELETE FROM native_home_requests WHERE user_id=?", body.userId);
    return Response.json({
      status: "registered",
      count: input.data.actions.length,
    });
  }
  const saved = sql
    .exec<{
      actions: string;
    }>("SELECT actions FROM native_home_manifest WHERE user_id=?", body.userId)
    .toArray()[0];
  const actions = localManifestSchema.parse({
    actions: saved ? JSON.parse(saved.actions) : [],
  }).actions;
  if (body.operation === "native_home_actions")
    return Response.json({ actions, execution: "local_iphone_only" });
  if (body.operation === "native_home_request") {
    const input = localRequestSchema.safeParse(body.action);
    const approved =
      input.success && actions.find((a) => a.actionId === input.data.actionId);
    if (!approved)
      return Response.json(
        { error: "local_action_not_registered" },
        { status: 422 },
      );
    const pending = sql
      .exec<{
        n: number;
      }>("SELECT COUNT(*) AS n FROM native_home_requests WHERE user_id=?", body.userId)
      .toArray()[0].n;
    if (pending >= 10)
      return Response.json({ error: "local_queue_full" }, { status: 429 });
    const id = crypto.randomUUID();
    sql.exec(
      "INSERT INTO native_home_requests VALUES(?,?,?,?,0)",
      id,
      body.userId,
      approved.actionId,
      now + 60000,
    );
    return Response.json({
      status: "queued",
      executed: false,
      requestId: id,
      expiresIn: 60,
      message:
        "Waiting for the signed-in iPhone companion. Keep it open. This is not proof the action ran.",
    });
  }
  if (body.operation === "native_home_poll") {
    const row = sql
      .exec<{
        id: string;
        action_id: string;
        expires: number;
      }>("SELECT id,action_id,expires FROM native_home_requests WHERE user_id=? AND claimed=0 ORDER BY expires LIMIT 1", body.userId)
      .toArray()[0];
    if (!row) return Response.json({ request: null });
    // Claim before returning. Never retry device writes after an ambiguous network failure.
    sql.exec("UPDATE native_home_requests SET claimed=1 WHERE id=?", row.id);
    return Response.json({
      request: {
        requestId: row.id,
        actionId: row.action_id,
        expiresAt: new Date(row.expires).toISOString(),
      },
    });
  }
  return Response.json({ error: "unknown_native_operation" }, { status: 422 });
}
export function createNativeHomeExecutor(env: Env, userId: string) {
  return async (action?: unknown, operation = "native_home_request") => {
    const response = await env.CONFIRMATIONS.get(
      env.CONFIRMATIONS.idFromName(`app:${env.DEEPSPACE_APP_ID}`),
    ).fetch(
      new Request("https://internal/native", {
        method: "POST",
        body: JSON.stringify({ userId, operation, action }),
      }),
    );
    return response.json();
  };
}
