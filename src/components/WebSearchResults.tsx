import type { SearchResult } from "../jarvis/search-contracts";
import { publicSourceUrl } from "../jarvis/search-contracts";
export function WebSearchResults({ result }: { result: SearchResult | null }) {
  if (!result) return null;
  return <section aria-label="Live web results" className="personal-card">
    <h2>Live web results</h2><p>{result.answer}</p>
    <p className="muted text-sm">Public sources can be incomplete or disagree. Review the linked sources for context.</p>
    {result.sources.map(source => publicSourceUrl(source.url) ? <article key={source.url}>
      <a style={{ display: "flex", alignItems: "center", minHeight: 44, overflowWrap: "anywhere" }} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
      <p>{source.domain}{source.date ? ` · ${source.date}` : ""}</p>
    </article> : null)}
    <time dateTime={result.retrievedAt}>Retrieved {new Date(result.retrievedAt).toLocaleString()}</time>
  </section>;
}
