import { describe, expect, it } from 'vitest';
import {
  redactSecret,
  safeEvidence,
  safePath,
} from '../../../supabase/functions/_shared/scanner/redact.ts';

describe('redactSecret', () => {
  it('keeps only the first 4 and last 4 characters', () => {
    expect(redactSecret('abcdEFGHijklmnopx9Q2')).toBe('abcd…x9Q2');
  });

  it('hides short values completely', () => {
    expect(redactSecret('abc')).toBe('…');
    expect(redactSecret('abcdefghijk')).toBe('…');
  });
});

describe('safePath', () => {
  it('keeps only the path: no host, query string or fragment', () => {
    expect(safePath('https://app.example.test/assets/a.js?token=abc#x')).toBe('/assets/a.js');
  });

  it('shortens long unbroken runs (hashes) so nothing secret-like is stored', () => {
    expect(safePath('https://a.test/assets/index-ABCDEFGHIJKLMNOPQRSTUVWXYZ.js')).toBe(
      '/assets/index-ABCDEFGH….js',
    );
  });
});

describe('safeEvidence', () => {
  it('caps the length and removes control characters', () => {
    const out = safeEvidence(`a\u0000b\n${'x'.repeat(500)}`);
    expect(out.length).toBeLessThanOrEqual(200);
    // eslint-disable-next-line no-control-regex -- asserting control characters are gone
    expect(out).not.toMatch(/[\u0000-\u001f]/);
  });

  it('never lets a 24+ character letter/digit run through', () => {
    expect(safeEvidence('A'.repeat(60))).not.toMatch(/[A-Za-z0-9+/=]{24,}/);
  });
});
