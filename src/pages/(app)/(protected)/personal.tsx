import { useState } from "react";
import { getAuthToken, useAuthProfileReady, useQuery } from "deepspace";
import { Button, Input, ConfirmModal } from "../../../components/ui";
async function api(path: string, body: unknown) {
  const token = await getAuthToken();
  const res = await fetch(`/api/jarvis/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      res.status === 429
        ? "Please wait a minute before trying again."
        : "Could not complete this action.",
    );
  return res.json() as Promise<{ token: string }>;
}
export default function PersonalPage() {
  const { user } = useAuthProfileReady({ requireUser: true });
  const where = { userId: user?.id ?? "__none__" };
  const { records: memories } = useQuery<{ content: string; category: string }>(
    "memories",
    { where },
  );
  const { records: reminders } = useQuery<{
    title: string;
    dueAt: string;
    status: string;
  }>("reminders", { where, orderBy: "dueAt", orderDir: "asc" });
  const { records: notifications } = useQuery<{
    title: string;
    message: string;
  }>("notifications", { where, orderBy: "createdAt", orderDir: "desc" });
  const { records: chats } = useQuery<{ title: string }>("ai-chats", { where });
  const [memory, setMemory] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    token: string;
    label: string;
  } | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const request = (collection: string, recordId: string, label: string) =>
    run(async () => {
      const result = await api("confirmations/request", {
        collection,
        recordId,
      });
      setPending({ token: result.token, label });
    });
  return (
    <div className="personal-page">
      <p className="eyebrow">ONLY WHAT MATTERS</p>
      <h1>My space</h1>
      <p className="muted">
        Your reminders, memories, and conversations. Always yours to control.
      </p>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <h2>Reminders</h2>
      <form
        className="personal-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("reminders", {
              title,
              dueAt: new Date(due).toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            setTitle("");
            setDue("");
          });
        }}
      >
        <Input
          aria-label="Reminder title"
          required
          maxLength={500}
          placeholder="Something to remember"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          aria-label="Reminder time"
          required
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <Button disabled={busy} type="submit">
          Add reminder
        </Button>
      </form>
      {!reminders.length && (
        <p className="muted mt-4 text-sm">
          No reminders yet. Add one here or ask JARVIS.
        </p>
      )}
      {reminders.map((r) => (
        <div className="personal-card" key={r.recordId}>
          <div>
            {r.data.title}
            <br />
            <small>
              {new Date(r.data.dueAt).toLocaleString()} · {r.data.status}
            </small>
          </div>
          <button
            disabled={busy}
            onClick={() => void request("reminders", r.recordId, r.data.title)}
          >
            Delete
          </button>
        </div>
      ))}
      <h2>Memory</h2>
      <p className="muted mb-4 text-sm">
        JARVIS remembers preferences only when you ask. Conversation history is
        stored separately.
      </p>
      <form
        className="personal-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("memories", { content: memory, category: "preference" });
            setMemory("");
          });
        }}
      >
        <Input
          aria-label="New memory"
          required
          maxLength={2000}
          placeholder="I prefer temperatures in Celsius"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
        />
        <Button disabled={busy} type="submit">
          Remember
        </Button>
      </form>
      {memories.map((r) => (
        <div key={r.recordId} className="personal-card">
          <span>{r.data.content}</span>
          <button
            disabled={busy}
            onClick={() => void request("memories", r.recordId, r.data.content)}
          >
            Delete
          </button>
        </div>
      ))}
      <h2>Notifications</h2>
      {!notifications.length && (
        <p className="muted text-sm">
          Reminder notifications will appear here when due. Delivery runs about
          once a minute while the service is available.
        </p>
      )}
      {notifications.map((r) => (
        <div className="personal-card" key={r.recordId}>
          <div>
            {r.data.title}
            <br />
            <small>{r.data.message}</small>
          </div>
        </div>
      ))}
      <h2>Conversation privacy</h2>
      {chats.map((r) => (
        <div className="personal-card" key={r.recordId}>
          <span>{r.data.title || "Conversation"}</span>
          <button
            disabled={busy}
            onClick={() => void request("ai-chats", r.recordId, r.data.title)}
          >
            Delete conversation
          </button>
        </div>
      ))}
      <ConfirmModal
        open={!!pending}
        onClose={() => setPending(null)}
        title="Delete this item?"
        description={pending?.label}
        confirmText="Delete permanently"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (pending) {
              await api("confirmations/approve", { token: pending.token });
              setPending(null);
            }
          })
        }
      />
    </div>
  );
}
