import { buildCronContext, type CronTask } from "deepspace/worker";
import type { Env } from "../worker";
import type { Reminder, Stored } from "./jarvis/contracts";

export const tasks: CronTask[] = [
  { name: "deliver-reminders", intervalMinutes: 1 },
];
export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== "deliver-reminders") return;
  const room = env.RECORD_ROOMS.get(
    env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`),
  );
  const response = await room.fetch(
    new Request("https://internal/api/tools/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": env.OWNER_USER_ID,
        "X-App-Action": "true",
      },
      body: JSON.stringify({
        tool: "records.query",
        params: {
          collection: "reminders",
          where: { status: "scheduled" },
          orderBy: "dueAt",
          orderDir: "asc",
          limit: 500,
        },
      }),
    }),
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: { records: Stored<Reminder>[] };
  };
  if (!response.ok || !result.success) throw new Error("Reminder query failed");
  const due = result.data?.records ?? [];
  for (const reminder of due) {
    if (
      !reminder.data.userId ||
      !Number.isFinite(Date.parse(reminder.data.dueAt)) ||
      Date.parse(reminder.data.dueAt) > Date.now()
    )
      continue;
    const user = buildCronContext(
      env,
      reminder.data.userId,
      `app:${env.DEEPSPACE_APP_ID}`,
    );
    const exists = await user.records.query("notifications", {
      where: { reminderId: reminder.recordId },
      limit: 1,
    });
    if (!exists.length)
      await user.records.create("notifications", {
        userId: reminder.data.userId,
        reminderId: reminder.recordId,
        title: "Reminder",
        message: reminder.data.title,
        read: 0,
      });
    await user.records.update("reminders", reminder.recordId, {
      status: "delivered",
    });
  }
}
