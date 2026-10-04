export type VampIntent = "play";

/** Only call for new user text/transcripts; this never authorizes playback. */
export function parseVampIntent(text: string): VampIntent | null {
  if (
    typeof text !== "string" ||
    text.length > 180 ||
    /[?\r\n\u0000-\u001f\u007f]/.test(text)
  )
    return null;

  const command = text
    .trim()
    .toLowerCase()
    .replace(/ +/g, " ")
    .replace(/[.!]$/, "")
    .trim()
    .replace(/^(?:hey )?jarvis(?: *[,:!] *| +)/, "")
    .replace(/^(?:please|kindly)(?: *, *| +)/, "")
    .replace(/,? +please$/, "");

  return command === "play vamp" ? "play" : null;
}
