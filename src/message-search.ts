export type HighlightSegment = { text: string; match: boolean };

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function messageMatches(payload: unknown, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return typeof payload === 'string' && payload.toLowerCase().includes(normalizedQuery);
}

export function splitOnQuery(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return parts
    .filter(part => part.length > 0)
    .map(part => ({ text: part, match: part.toLowerCase() === q.toLowerCase() }));
}
