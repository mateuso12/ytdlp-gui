/**
 * Extracts the http(s) URLs from free-form text (whitespace separated),
 * dropping anything that is not a URL and removing duplicates while keeping
 * the order of first occurrence.
 */
export function splitUrls(text: string): string[] {
  const seen = new Set<string>()
  for (const token of text.split(/\s+/)) {
    if (!token || seen.has(token)) continue
    try {
      const { protocol } = new URL(token)
      if (protocol === 'http:' || protocol === 'https:') seen.add(token)
    } catch {
      // not a URL
    }
  }
  return [...seen]
}
