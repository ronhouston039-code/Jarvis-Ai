import { handleRoku } from "./roku-ledger";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../../worker";
import { buildCronContext, deleteChatCascade, getChat } from "deepspace/worker";
import { deletionSchema } from "./contracts";

/** Internal-only action ledger; no route exposes its DO fetch directly. */
export class ConfirmationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS approvals (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS quotas (user_id TEXT,bucket TEXT,window INTEGER,count INTEGER,PRIMARY KEY(user_id,bucket))",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,user_id TEXT,collection TEXT,record_id TEXT,created_at INTEGER,status TEXT)",
    );
  }
  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      userId: string;
      operation: string;
      token?: string;
      action?: unknown;
      bucket?: string;
      limit?: number;
    };
    if (!body.userId)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (body.operation.startsWith("roku_"))
      return handleRoku(this.ctx.storage.sql, this.env, body);
    if (body.operation === "rate") {
      const now = Math.floor(Date.now() / 60000);
      const rows = this.ctx.storage.sql
        .exec<{
          window: number;
          count: number;
        }>("SELECT window,count FROM quotas WHERE user_id=? AND bucket=?", body.userId, body.bucket ?? "default")
        .toArray();
      const count = rows[0]?.window === now ? rows[0].count : 0;
      if (count >= (body.limit ?? 20))
        return Response.json(
          { error: "rate_limited" },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO quotas(user_id,bucket,window,count) VALUES(?,?,?,?)",
        body.userId,
        body.bucket ?? "default",
        now,
        count + 1,
      );
      this.ctx.storage.sql.exec("DELETE FROM quotas WHERE window<?", now - 60);
      return Response.json({ ok: true });
    }
    const context = buildCronContext(
      this.env,
      body.userId,
      `app:${this.env.DEEPSPACE_APP_ID}`,
    );
    const room = this.env.RECORD_ROOMS.get(
      this.env.RECORD_ROOMS.idFromName(`app:${this.env.DEEPSPACE_APP_ID}`),
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM approvals WHERE expires<?",
      Date.now(),
    );
    if (body.operation === "request") {
      const action = deletionSchema.safeParse(body.action);
      if (!action.success)
        return Response.json({ error: "invalid_action" }, { status: 422 });
      const { collection, recordId } = action.data;
      const rows = (await context.records.query(collection, {
        where: { recordId },
        limit: 1,
      })) as { data: { userId: string } }[];
      if (!rows.length || rows[0].data.userId !== body.userId)
        return Response.json({ error: "not_found" }, { status: 404 });
      const token = crypto.randomUUID() + crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO approvals(token,user_id,action,expires) VALUES (?,?,?,?)",
        token,
        body.userId,
        JSON.stringify(action.data),
        Date.now() + 300000,
      );
      return Response.json({ token, action: action.data, expiresIn: 300 });
    }
    const rows = this.ctx.storage.sql
      .exec<{
        action: string;
      }>("SELECT action FROM approvals WHERE token=? AND user_id=? AND used=0 AND expires>?", body.token ?? "", body.userId, Date.now())
      .toArray();
    if (!rows.length)
      return Response.json(
        { error: "invalid_or_expired_confirmation" },
        { status: 409 },
      );
    const approvedDeletion = deletionSchema.safeParse(
      JSON.parse(rows[0].action),
    );
    if (!approvedDeletion.success)
      return Response.json(
        { error: "confirmation_action_mismatch" },
        { status: 409 },
      );
    // No await between lookup and claim: one token cannot execute twice.
    this.ctx.storage.sql.exec(
      "UPDATE approvals SET used=1 WHERE token=?",
      body.token ?? "",
    );
    const action = approvedDeletion.data;
    const owned = (await context.records.query(action.collection, {
      where: { recordId: action.recordId },
      limit: 1,
    })) as { data: { userId: string } }[];
    if (!owned.length || owned[0].data.userId !== body.userId)
      return Response.json({ error: "not_found" }, { status: 404 });
    if (action.collection === "ai-chats") {
      if (!(await getChat(room, action.recordId, body.userId)))
        return Response.json({ error: "not_found" }, { status: 404 });
      await deleteChatCascade(room, action.recordId, body.userId);
    } else {
      await context.records.delete(action.collection, action.recordId);
    }
    this.ctx.storage.sql.exec(
      "DELETE FROM approvals WHERE token=?",
      body.token ?? "",
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO audit VALUES(?,?,?,?,?,?)",
      crypto.randomUUID(),
      body.userId,
      action.collection,
      action.recordId,
      Date.now(),
      "completed",
    );
    return Response.json({ status: "completed", action });
  }
}
