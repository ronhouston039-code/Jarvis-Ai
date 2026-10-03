import type { Env } from "../../worker";
import { HomeAssistantProvider } from "./home-assistant";
import { homeActionSchema } from "./home-assistant-contracts";
type HomeRequest = {
  userId: string;
  operation: string;
  token?: string;
  action?: unknown;
};
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const safe = new Set([
    "home_assistant_invalid_configuration",
    "home_assistant_invalid_allowlist",
    "home_assistant_device_not_found",
    "home_assistant_action_not_allowed",
    "home_assistant_invalid_value",
    "home_assistant_confirmation_required",
  ]);
  return Response.json(
    {
      error: safe.has(code) ? code : "home_assistant_unavailable",
      message: safe.has(code)
        ? "This device action is unavailable or needs setup. Check the approved device settings."
        : "Home Assistant could not confirm the request. Check the device before retrying any action.",
    },
    { status: safe.has(code) ? 422 : 503 },
  );
}
export async function handleHomeAssistant(
  sql: SqlStorage,
  env: Env,
  body: HomeRequest,
): Promise<Response> {
  if (body.userId !== env.OWNER_USER_ID)
    return Response.json({ error: "owner_home_only" }, { status: 403 });
  sql.exec(
    "CREATE TABLE IF NOT EXISTS home_connections(user_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL)",
  );
  const enabled =
    sql
      .exec<{
        enabled: number;
      }>("SELECT enabled FROM home_connections WHERE user_id=?", body.userId)
      .toArray()[0]?.enabled !== 0;
  if (
    body.operation === "home_disconnect" ||
    body.operation === "home_connect"
  ) {
    sql.exec(
      "INSERT OR REPLACE INTO home_connections VALUES(?,?)",
      body.userId,
      body.operation === "home_connect" ? 1 : 0,
    );
    sql.exec(
      "DELETE FROM approvals WHERE user_id=? AND action LIKE ?",
      body.userId,
      '%"provider":"home_assistant"%',
    );
    return Response.json({ enabled: body.operation === "home_connect" });
  }
  if (body.operation === "home_cancel") {
    sql.exec(
      "DELETE FROM approvals WHERE token=? AND user_id=? AND action LIKE ?",
      body.token ?? "",
      body.userId,
      '%"provider":"home_assistant"%',
    );
    return Response.json({ status: "cancelled" });
  }
  if (body.operation === "home_config" && !enabled)
    return Response.json({
      available: !!env.HOME_ASSISTANT_URL && !!env.HOME_ASSISTANT_TOKEN,
      enabled: false,
    });
  if (!enabled || !env.HOME_ASSISTANT_URL || !env.HOME_ASSISTANT_TOKEN)
    return Response.json(
      {
        available: false,
        enabled,
        error: enabled
          ? "home_assistant_not_connected"
          : "home_assistant_disconnected",
      },
      { status: 409 },
    );
  let provider: HomeAssistantProvider;
  try {
    provider = new HomeAssistantProvider(
      env.HOME_ASSISTANT_URL,
      env.HOME_ASSISTANT_TOKEN,
      env.HOME_ASSISTANT_ALLOWED_DEVICES,
    );
  } catch (error) {
    return failure(error);
  }
  let action: unknown;
  let confirmed = false;
  if (body.operation === "home_config")
    return Response.json({ available: true, enabled });
  if (body.operation === "home_devices") {
    try {
      return Response.json({
        devices: await provider.listDevices(),
        connected: true,
      });
    } catch (error) {
      return failure(error);
    }
  }
  if (body.operation === "home_approve") {
    const fingerprint = await provider.fingerprint();
    const row = sql
      .exec<{
        action: string;
      }>("SELECT action FROM approvals WHERE token=? AND user_id=? AND used=0 AND expires>?", body.token ?? "", body.userId, Date.now())
      .toArray()[0];
    if (!row)
      return Response.json(
        { error: "invalid_or_expired_confirmation" },
        { status: 409 },
      );
    const bound = JSON.parse(row.action) as {
      provider?: string;
      fingerprint?: string;
      action?: unknown;
    };
    if (
      bound.provider !== "home_assistant" ||
      bound.fingerprint !== fingerprint ||
      !homeActionSchema.safeParse(bound.action).success
    )
      return Response.json(
        { error: "confirmation_action_mismatch" },
        { status: 409 },
      );
    sql.exec("UPDATE approvals SET used=1 WHERE token=?", body.token ?? "");
    action = bound.action;
    confirmed = true;
  } else if (body.operation === "home_action") {
    const parsed = homeActionSchema.safeParse(body.action);
    if (!parsed.success)
      return Response.json({ error: "invalid_device_action" }, { status: 422 });
    action = parsed.data;
    try {
      const prepared = await provider.prepare(action);
      if (prepared.sensitive) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        const fingerprint = await provider.fingerprint();
        sql.exec("DELETE FROM approvals WHERE expires<?", Date.now());
        sql.exec(
          "INSERT INTO approvals(token,user_id,action,expires) VALUES(?,?,?,?)",
          token,
          body.userId,
          JSON.stringify({ provider: "home_assistant", fingerprint, action }),
          Date.now() + 60000,
        );
        return Response.json({
          status: "confirmation_required",
          executed: false,
          token,
          expiresIn: 60,
          device: prepared.device,
          action,
          prompt:
            prepared.action.action === "off"
              ? `Turn off ${prepared.device.name} now?`
              : prepared.action.action === "scene"
                ? `Run ${prepared.device.name} now?`
                : `Confirm ${prepared.action.action.replace(/_/g, " ")} for ${prepared.device.name} now?`,
          open: "/connections?tab=home",
        });
      }
    } catch (error) {
      return failure(error);
    }
  } else
    return Response.json({ error: "unknown_home_operation" }, { status: 422 });
  const started = Date.now();
  try {
    const result = await provider.execute(action, confirmed);
    sql.exec(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      crypto.randomUUID(),
      body.userId,
      "home_assistant",
      JSON.stringify(action),
      Date.now(),
      JSON.stringify({
        status: result.status,
        durationMs: Date.now() - started,
      }),
    );
    return Response.json(result);
  } catch (error) {
    sql.exec(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      crypto.randomUUID(),
      body.userId,
      "home_assistant",
      JSON.stringify(action),
      Date.now(),
      JSON.stringify({
        status: "failed_or_unknown",
        durationMs: Date.now() - started,
      }),
    );
    return failure(error);
  }
}
export type HomeExecutor = (
  action?: unknown,
  operation?: string,
) => Promise<unknown>;
export function createHomeExecutor(env: Env, userId: string): HomeExecutor {
  return async (action, operation = "home_action") => {
    if (userId !== env.OWNER_USER_ID) return { error: "owner_home_only" };
    const response = await env.CONFIRMATIONS.get(
      env.CONFIRMATIONS.idFromName(`app:${env.DEEPSPACE_APP_ID}`),
    ).fetch(
      new Request("https://internal/home", {
        method: "POST",
        body: JSON.stringify({ userId, operation, action }),
      }),
    );
    return response.json();
  };
}
