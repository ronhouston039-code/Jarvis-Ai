/** Only public information requests. Weather and device/private-account commands retain their existing paths. */
export function searchIntent(text: string): string | null {
  const query = text.trim().replace(/^(?:hey\s+)?jarvis[,\s]+/i, "").replace(/[?!]+$/, "");
  if (/^(?:how (?:are you|is it going|do you feel)|what(?:\x27s| is) up|who are you|what can you do|where are you)[.!]*$/i.test(query)) return null;
  if (query.length < 3 || query.length > 300 || /\b(?:weather|forecast|email|inbox|gmail|calendar|password|token|api key|purchase|buy|pay|transfer|playlist|vamp|tv|television|thermostat|light|remind|settings|account|notification|music|navigate|location|my |our )\b/i.test(query)) return null;
  if (/\b(?:tvly-|sk-fish-|gsk_)/i.test(query) || /https?:\/\/\S*[?&](?:\S*key|token|secret)=/i.test(query)) return null;
  if (/^(?:search(?: the web)?(?: for)?|look up|research|find|check|explain|tell me about|latest)\b/i.test(query) || /^(?:what|who|when|where|why|how)\b/i.test(query)) return query;
  return null;
}
