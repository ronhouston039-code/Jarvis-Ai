export const THEMES = [
  {
    id: "jarvis",
    label: "Holographic blue",
    description: "Midnight blue with cyan holographic instruments.",
  },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export function getActiveTheme(): ThemeId {
  return "jarvis";
}
export function getTheme(_id: string) {
  return THEMES[0];
}
