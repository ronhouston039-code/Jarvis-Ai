import type { Env } from "../../worker";
/** Compatibility refusal: cloud routes never contact local Roku ports. Use Home Assistant. */
export async function handleRoku(
  _sql: SqlStorage,
  env: Env,
  body: {
    userId: string;
    operation?: string;
    token?: string;
    action?: unknown;
  },
): Promise<Response> {
  if (body.userId !== env.OWNER_USER_ID)
    return Response.json({ error: "owner_roku_only" }, { status: 403 });
  return Response.json(
    {
      name: "TCL Roku TV",
      online: false,
      error: "home_assistant_bridge_required",
      message:
        "Direct local Roku access is disabled. Connect this TV through Home Assistant.",
    },
    { status: 409 },
  );
}
export type RokuExecutor = (
  action: unknown,
  operation?: string,
) => Promise<unknown>;
