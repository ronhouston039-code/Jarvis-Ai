import { z } from "zod";

export const searchRequestSchema = z.object({ query: z.string().trim().min(3).max(300).refine(value => !/tvly-|sk-fish-|gsk_|bearer\s|(?:api.?key|token|password|secret)\s*[=:]/i.test(value)) }).strict();
export type SearchSource = { title: string; url: string; domain: string; date?: string };
export type SearchResult = { label: "Live web results"; answer: string; sources: SearchSource[]; retrievedAt: string };
export const searchMessages = {
  search_disabled: "Live web search is turned off.",
  search_not_connected: "Live web search is not connected yet.",
  search_unavailable: "Live web search is temporarily unavailable.",
} as const;

/** Public citations only; never render credential-bearing or local-network links. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") || host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    if ([...url.searchParams.keys()].some(key => /key|token|secret|password|credential|signature|auth/i.test(key))) return null;
    if (/tvly-|sk-fish-|gsk_|bearer\s/i.test(url.href)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").replace(/(?:tvly-|sk-fish-|gsk_)[A-Za-z0-9_-]+/gi, "[redacted]").replace(/(?:bearer|password|api.?key|access.?token|secret)\s*[=:]?\s+[A-Za-z0-9_-]{8,}/gi, "[redacted]").slice(0, limit).trim() : "";
export function normalizeSearch(data: unknown): SearchResult {
  const body = data as { answer?: unknown; results?: unknown[] } | null;
  const sources: SearchSource[] = [];
  let excerpt = "";
  if (!Array.isArray(body?.results)) throw new Error("search_unavailable");
  for (const item of body.results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = publicSourceUrl(row.url), title = clean(row.title, 200);
    if (!url || !title || sources.some(source => source.url === url)) continue;
    const date = typeof row.published_date === "string" && Number.isFinite(Date.parse(row.published_date)) ? row.published_date.slice(0, 40) : undefined;
    sources.push({ url, title, domain: new URL(url).hostname, ...(date ? { date } : {}) });
    if (!excerpt) excerpt = clean(row.content, 500);
    if (sources.length === 4) break;
  }
  if (sources.length < 2) throw new Error("search_unavailable");
  const answer = clean(body?.answer, 1200) || (excerpt ? `Source excerpt: ${excerpt}` : "These sources contain the live results. Open them to review the details.");
  return { label: "Live web results", answer, sources, retrievedAt: new Date().toISOString() };
}

