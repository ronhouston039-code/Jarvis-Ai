import { z } from "zod";
export function validApplePlaylistUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "music.apple.com" &&
      !url.username &&
      !url.password &&
      url.pathname.includes("/playlist/") &&
      !url.pathname.includes("your-playlist-id") &&
      /\/(pl\.[A-Za-z0-9-]+|p\.[A-Za-z0-9-]+)$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export const musicLinkInput = z
  .object({
    preset: z.enum(["focus", "workout", "relax"]),
    label: z.string().trim().min(1).max(100),
    url: z
      .string()
      .max(2000)
      .refine(
        validApplePlaylistUrl,
        "Use a real Apple Music playlist share URL",
      ),
    enabled: z.literal(1).default(1),
  })
  .strict();
