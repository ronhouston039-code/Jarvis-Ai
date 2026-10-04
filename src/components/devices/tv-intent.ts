export type TvPowerIntent = "on" | "off";

const target = "(?:(?:the|my) )?(?:tv|television|ky tv)";
const beforeTarget = new RegExp(`^(?:turn|switch|power) (on|off) ${target}$`);
const afterTarget = new RegExp(`^(?:turn|switch|power) ${target} (on|off)$`);

/**
 * Recognizes a single user-entered imperative for the configured TV shortcut.
 * Everything outside this narrow grammar stays in the normal assistant flow;
 * recognition itself never authorizes or executes an action.
 */
export function parseTvPowerIntent(text: string): TvPowerIntent | null {
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

  const action =
    beforeTarget.exec(command)?.[1] ?? afterTarget.exec(command)?.[1];
  return action === "on" || action === "off" ? action : null;
}
