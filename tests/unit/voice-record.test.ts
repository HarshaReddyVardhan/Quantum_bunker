import { describe, it, expect } from 'vitest';
import {
  VOICE_MIME_CANDIDATES,
  chooseSupportedMime,
  extensionForMime,
  voiceFileName,
} from '../../src/voice-record';

describe('voice-record', () => {
  describe('chooseSupportedMime', () => {
    it('returns the first candidate the predicate accepts', () => {
      const supported = chooseSupportedMime(VOICE_MIME_CANDIDATES, (m) => m === 'audio/webm');
      expect(supported).toBe('audio/webm');
    });

    it('prefers earlier candidates over later ones', () => {
      const supported = chooseSupportedMime(VOICE_MIME_CANDIDATES, () => true);
      expect(supported).toBe(VOICE_MIME_CANDIDATES[0]);
    });

    it('returns null when nothing is supported', () => {
      expect(chooseSupportedMime(VOICE_MIME_CANDIDATES, () => false)).toBeNull();
    });
  });

  describe('extensionForMime', () => {
    it('strips codec params and maps known containers', () => {
      expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
      expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg');
      expect(extensionForMime('audio/mp4')).toBe('m4a');
    });
    it('falls back to a generic extension for unknown types', () => {
      expect(extensionForMime('audio/flac')).toBe('audio');
    });
  });

  describe('voiceFileName', () => {
    it('embeds the timestamp and a container-appropriate extension', () => {
      expect(voiceFileName('audio/webm;codecs=opus', 1700000000000)).toBe('voice-1700000000000.webm');
    });
  });
});
