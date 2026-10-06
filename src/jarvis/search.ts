import { normalizeSearch, type SearchResult } from "./search-contracts";
/** Fixed server-side destination. No arbitrary URL input, retries or raw error logging. */
export async function tavilySearch(query: string, key: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: true, include_raw_content: false }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), redirect: "error",
  });
  if (!response.ok) throw new Error("search_unavailable");
  const text = await response.text();
  if (text.length > 150000) throw new Error("search_unavailable");
  return normalizeSearch(JSON.parse(text));
}
