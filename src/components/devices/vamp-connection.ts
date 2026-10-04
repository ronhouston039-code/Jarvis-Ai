import { shortcutUrl } from "../../jarvis/connections";

export type SavedVampConnection = {
  recordId: string;
  shortcutName: string;
};
export function resolveVampConnection(
  records: readonly { recordId: string; data: unknown }[],
  userId: string | null,
): { connection: SavedVampConnection | null; error: string } {
  const matches = records.filter(({ data }) => {
    if (!userId || !data || typeof data !== "object") return false;
    const saved = data as Record<string, unknown>;
    return (
      saved.userId === userId &&
      saved.name === "Play Vamp" &&
      saved.kind === "music" &&
      saved.enabled === 1
    );
  });
  if (matches.length !== 1)
    return {
      connection: null,
      error: matches.length
        ? "More than one saved Play Vamp music connection is enabled. Choose one connection before sending a request."
        : "Your saved Play Vamp music connection is unavailable. No request was sent.",
    };
  const saved = matches[0];
  const name = (saved.data as Record<string, unknown>).onShortcut;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 150 ||
    /[\u0000-\u001f\u007f]/.test(name)
  )
    return {
      connection: null,
      error:
        "The saved Play Vamp shortcut name is invalid. No request was sent.",
    };
  return {
    connection: { recordId: saved.recordId, shortcutName: name },
    error: "",
  };
}
/** This must run synchronously in the approved button's click handler. */
export function launchVampShortcut(
  connection: SavedVampConnection,
  navigate: (url: string) => void,
): void {
  navigate(shortcutUrl(connection.shortcutName));
}
