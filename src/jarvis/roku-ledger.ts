import type { Env } from "../../worker";
import {
  allowedRokuApps,
  privateRokuIp,
  rokuAction,
  RokuProvider,
} from "./roku";
type RequestBody = {
  userId: string;
  operation: string;
  token?: string;
  action?: unknown;
};
export async function handleRoku(
  sql: SqlStorage,
  env: Env,
  body: RequestBody,
): Promise<Response> {
  if (body.userId !== env.OWNER_USER_ID)
    return Response.json({ error: "owner_roku_only" }, { status: 403 });
  sql.exec(
    "CREATE TABLE IF NOT EXISTS roku_connections(user_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL)",
  );
  const enabled =
    sql
      .exec<{
        enabled: number;
      }>("SELECT enabled FROM roku_connections WHERE user_id=?", body.userId)
      .toArray()[0]?.enabled !== 0;
  if (
    body.operation === "roku_disconnect" ||
    body.operation === "roku_connect"
  ) {
    sql.exec(
      "INSERT OR REPLACE INTO roku_connections VALUES(?,?)",
      body.userId,
      body.operation === "roku_connect" ? 1 : 0,
    );
    sql.exec(
      "DELETE FROM approvals WHERE user_id=? AND action LIKE ?",
      body.userId,
      '%"tool":"roku_power_off"%',
    );
    return Response.json({
      disconnected: body.operation === "roku_disconnect",
      name: "TCL Roku TV",
    });
  }
  if (!enabled || !env.ROKU_TV_IP || !privateRokuIp(env.ROKU_TV_IP))
    return Response.json(
      {
        name: "TCL Roku TV",
        online: false,
        enabled,
        configured: !!env.ROKU_TV_IP,
        error: !enabled ? "roku_disconnected" : "roku_configuration_required",
      },
      { status: 409 },
    );
  const provider = new RokuProvider(
    env.ROKU_TV_IP,
    allowedRokuApps(env.ROKU_ALLOWED_APPS),
  );
  if (body.operation === "roku_power_request") {
    const token = crypto.randomUUID() + crypto.randomUUID();
    sql.exec("DELETE FROM approvals WHERE expires<?", Date.now());
    sql.exec(
      "INSERT INTO approvals(token,user_id,action,expires) VALUES(?,?,?,?)",
      token,
      body.userId,
      JSON.stringify({ tool: "roku_power_off", ip: env.ROKU_TV_IP }),
      Date.now() + 60000,
    );
    return Response.json({
      status: "confirmation_required",
      executed: false,
      token,
      expiresIn: 60,
      prompt: "Turn off TCL Roku TV now?",
      open: "/connections?tab=home",
      action: "roku_power_off",
    });
  }
  if (body.operation === "roku_power_cancel") {
    sql.exec(
      "DELETE FROM approvals WHERE token=? AND user_id=? AND action LIKE ?",
      body.token ?? "",
      body.userId,
      '%"tool":"roku_power_off"%',
    );
    return Response.json({ cancelled: true });
  }
  let action: unknown;
  if (body.operation === "roku_power_approve") {
    const stored = sql
      .exec<{
        action: string;
      }>("SELECT action FROM approvals WHERE token=? AND user_id=? AND used=0 AND expires>?", body.token ?? "", body.userId, Date.now())
      .toArray()[0];
    if (!stored)
      return Response.json(
        { error: "invalid_or_expired_confirmation" },
        { status: 409 },
      );
    const bound = JSON.parse(stored.action) as { tool?: string; ip?: string };
    if (bound.tool !== "roku_power_off" || bound.ip !== env.ROKU_TV_IP)
      return Response.json(
        { error: "confirmation_action_mismatch" },
        { status: 409 },
      );
    // Claim before network I/O, including failures. Never blindly retry power actions.
    sql.exec("UPDATE approvals SET used=1 WHERE token=?", body.token ?? "");
    action = { tool: "roku_power_off" };
  } else if (body.operation === "roku_execute") {
    const parsed = rokuAction.safeParse(body.action);
    if (!parsed.success)
      return Response.json({ error: "invalid_roku_action" }, { status: 422 });
    action = parsed.data;
  } else
    return Response.json({ error: "unknown_roku_operation" }, { status: 422 });
  const started = Date.now();
  const safe = action as {
    tool: string;
    key?: string;
    appId?: string;
    direction?: string;
    steps?: number;
  };
  let result: unknown;
  let status = 200;
  try {
    switch (safe.tool) {
      case "roku_get_status":
        result = {
          ...(await provider.status()),
          name: "TCL Roku TV",
          configured: true,
          enabled: true,
        };
        break;
      case "roku_keypress":
        result = await provider.keypress(safe.key);
        break;
      case "roku_launch_app":
        result = await provider.launch(safe.appId!);
        break;
      case "roku_set_volume":
        result = await provider.volume(safe.direction!, safe.steps!);
        break;
      case "roku_power_off":
        result = await provider.powerOff();
        break;
      default:
        throw new Error("invalid_action");
    }
  } catch (error) {
    const disallowed =
      error instanceof Error && error.message === "roku_app_not_allowed";
    status = disallowed ? 422 : 503;
    result = {
      name: "TCL Roku TV",
      online: false,
      configured: true,
      enabled: true,
      error: disallowed ? "roku_app_not_allowed" : "roku_offline",
      message: disallowed
        ? "This app is not in your saved allowed Roku app list."
        : "The server could not reach TCL Roku TV. Cloud hosting needs a secure route to your local network.",
    };
  }
  sql.exec(
    "INSERT INTO audit VALUES(?,?,?,?,?,?)",
    crypto.randomUUID(),
    body.userId,
    "roku",
    JSON.stringify(safe),
    Date.now(),
    JSON.stringify({
      status,
      outcome:
        status === 200 && (result as { accepted?: boolean }).accepted === false
          ? "partial_or_unknown"
          : status === 200
            ? "completed"
            : "failed",
      durationMs: Date.now() - started,
    }),
  );
  return Response.json(result, { status });
}
export type RokuExecutor = (
  action: unknown,
  operation?: string,
) => Promise<unknown>;
export function createRokuExecutor(env: Env, userId: string): RokuExecutor {
  return async (action, operation = "roku_execute") => {
    if (userId !== env.OWNER_USER_ID)
      return { error: "owner_roku_only", executed: false };
    const response = await env.CONFIRMATIONS.get(
      env.CONFIRMATIONS.idFromName(`app:${env.DEEPSPACE_APP_ID}`),
    ).fetch(
      new Request("https://internal/roku", {
        method: "POST",
        body: JSON.stringify({ userId, operation, action }),
      }),
    );
    return response.json();
  };
}
