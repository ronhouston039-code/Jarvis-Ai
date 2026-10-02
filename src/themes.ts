export const THEMES = [
  {
    id: "jarvis",
    label: "Sea glass",
    description: "Quiet charcoal with a sea-glass accent.",
  },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export function getActiveTheme(): ThemeId {
  return "jarvis";
}
export function getTheme(_id: string) {
  return THEMES[0];
}
