// Ordered by preference: Opus-in-WebM is the most widely supported encrypted-
// audio container; bare webm/mp4 are fallbacks for browsers that lack it.
export const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

export function chooseSupportedMime(
  candidates: readonly string[],
  isSupported: (mime: string) => boolean,
): string | null {
  for (const mime of candidates) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

export function extensionForMime(mime: string): string {
  const base = mime.split(';')[0].trim();
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4') return 'm4a';
  return 'audio';
}

export function voiceFileName(mime: string, at: number = Date.now()): string {
  return `voice-${at}.${extensionForMime(mime)}`;
}
