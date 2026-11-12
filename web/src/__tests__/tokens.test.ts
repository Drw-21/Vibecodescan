// WCAG AA contrast for every text/background pair in both themes (spec: Accessibility).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  return out;
}

const light = tokens(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = {
  ...light,
  ...tokens(css.slice(darkStart, css.indexOf('@media (prefers-reduced-motion', darkStart))),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-secondary', 'bg'],
  ['text-secondary', 'surface'],
  ['accent', 'surface'],
  ['accent', 'bg'],
  ['accent-text', 'accent'],
  ['accent', 'accent-soft'],
  ['text', 'accent-soft'],
  ['critical', 'surface'],
  ['critical', 'critical-fill'],
  ['high', 'surface'],
  ['high', 'high-fill'],
  ['medium', 'surface'],
  ['medium', 'medium-fill'],
  ['low', 'surface'],
  ['low', 'low-fill'],
  ['pass', 'surface'],
  ['contrast-text', 'contrast-bg'],
  ['contrast-secondary', 'contrast-bg'],
  ['text', 'hero-from'],
  ['text-secondary', 'hero-from'],
  ['text', 'hero-to'],
  ['text-secondary', 'hero-to'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_name, t) => {
  it.each(TEXT_PAIRS)('%s on %s meets AA (4.5:1)', (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(contrast(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['field-border', 'surface'],
    ['field-border', 'bg'],
  ])('%s on %s is visible enough for a control border (3:1)', (fg, bg) => {
    expect(contrast(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring stands out from the page (3:1)', () => {
    expect(contrast(t['focus-ring'] ?? '', t['bg'] ?? '')).toBeGreaterThanOrEqual(3);
  });
});

describe('our own site headers (public/_headers)', () => {
  const headers = readFileSync(join(import.meta.dirname, '..', '..', 'public', '_headers'), 'utf8');
  it('sets every protection our scanner checks for', () => {
    for (const h of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy',
    ]) {
      expect(headers).toContain(h);
    }
  });
  it('never allows inline scripts', () => {
    const csp = /Content-Security-Policy: (.*)/.exec(headers)?.[1] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});

// Frosted glass: the colour under a glass surface depends on which glows are behind it. Check
// text on glass over the plain page and over every combination of glows (worst cases included).
describe('frosted glass keeps text readable', () => {
  type Rgba = [number, number, number, number];

  function rgbaTokens(block: string): Record<string, Rgba> {
    const out: Record<string, Rgba> = {};
    for (const m of block.matchAll(
      /--([a-z0-9-]+):\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)\s*;/gi,
    )) {
      out[m[1] ?? ''] = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    }
    return out;
  }
  const hexToRgb = (hex: string): [number, number, number] =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const over = (top: Rgba, under: [number, number, number]): [number, number, number] =>
    [0, 1, 2].map((i) => Math.round((top[i] ?? 0) * top[3] + (under[i] ?? 0) * (1 - top[3]))) as [
      number,
      number,
      number,
    ];
  const toHex = (c: [number, number, number]): string =>
    `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  const lightBlock = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
  const darkBlock = css.slice(darkStart, css.indexOf('@media (prefers-reduced-motion', darkStart));
  const lightRgba = rgbaTokens(lightBlock);
  const darkRgba = { ...lightRgba, ...rgbaTokens(darkBlock) };

  describe.each([
    ['light', light, lightRgba],
    ['dark', dark, darkRgba],
  ])('%s theme', (_name, hex, rgba) => {
    const auras = ['aura-1', 'aura-2', 'aura-3']
      .map((k) => rgba[k])
      .filter((a): a is Rgba => a !== undefined);
    const glass = rgba['glass-bg'];
    const base = hexToRgb(hex['bg'] ?? '#000000');
    // Every subset of glows stacked over the page colour.
    const backdrops: [number, number, number][] = [];
    for (let mask = 0; mask < 1 << auras.length; mask++) {
      let c = base;
      auras.forEach((a, i) => {
        if (mask & (1 << i)) c = over(a, c);
      });
      backdrops.push(c);
    }

    it('defines the glass and glow tokens', () => {
      expect(auras).toHaveLength(3);
      expect(glass).toBeDefined();
    });

    it.each(['text', 'text-secondary', 'accent', 'low'])(
      '%s on glass meets AA (4.5:1) over every glow',
      (fg) => {
        for (const b of backdrops) {
          const surface = toHex(over(glass ?? [0, 0, 0, 1], b));
          expect(contrast(hex[fg] ?? '', surface), `${fg} on ${surface}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      },
    );
  });
});
