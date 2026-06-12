import { describe, it, expect } from 'vitest';
import { normalizeQuery, messageMatches, splitOnQuery } from '../../src/message-search';

describe('message-search', () => {
  describe('normalizeQuery', () => {
    it('trims and lowercases', () => {
      expect(normalizeQuery('  HeLLo  ')).toBe('hello');
    });
    it('returns empty string for whitespace-only input', () => {
      expect(normalizeQuery('   ')).toBe('');
    });
  });

  describe('messageMatches', () => {
    it('matches case-insensitively on substring', () => {
      expect(messageMatches('The Quick Brown Fox', 'quick')).toBe(true);
    });
    it('returns false when the term is absent', () => {
      expect(messageMatches('hello world', 'zzz')).toBe(false);
    });
    it('treats an empty query as matching everything', () => {
      expect(messageMatches('anything', '')).toBe(true);
    });
    it('returns false for non-string payloads (e.g. file/binary messages)', () => {
      expect(messageMatches(undefined, 'x')).toBe(false);
      expect(messageMatches({ name: 'photo.png' }, 'photo')).toBe(false);
    });
  });

  describe('splitOnQuery', () => {
    it('returns a single non-matching segment when query is empty', () => {
      expect(splitOnQuery('hello', '')).toEqual([{ text: 'hello', match: false }]);
    });

    it('marks matching segments and preserves original casing', () => {
      const segs = splitOnQuery('Find the Fox and the fox', 'fox');
      expect(segs.filter(s => s.match).map(s => s.text)).toEqual(['Fox', 'fox']);
      expect(segs.map(s => s.text).join('')).toBe('Find the Fox and the fox');
    });

    it('escapes regex metacharacters in the query', () => {
      const segs = splitOnQuery('cost is $5.00 today', '$5.00');
      expect(segs.some(s => s.match && s.text === '$5.00')).toBe(true);
    });

    it('drops empty segments produced by adjacent matches', () => {
      const segs = splitOnQuery('aa', 'a');
      expect(segs.every(s => s.text.length > 0)).toBe(true);
      expect(segs.map(s => s.text).join('')).toBe('aa');
    });
  });
});
