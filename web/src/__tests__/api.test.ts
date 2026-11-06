import { describe, expect, it } from 'vitest';
import { createScan } from '../lib/api';
import { summarySentence } from '../lib/summary';

const env = {
  supabaseUrl: 'https://proj.supabase.test',
  supabaseAnonKey: 'anon-key',
  turnstileSiteKey: 'site',
};
const SUMMARY = {
  scanId: 's1',
  status: 'done',
  grade: 'D',
  score: 52,
  partial: false,
  counts: { critical: 1, high: 0, medium: 1, low: 1, info: 0 },
  topIssues: ['Your OpenAI API key is visible to anyone'],
};

function fakeFetch(status: number, body: unknown, seen: Request[] = []): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return Promise.resolve(
      typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status }),
    );
  };
}

describe('createScan', () => {
  it('posts to create-scan with only the public key and returns the summary', async () => {
    const seen: Request[] = [];
    const out = await createScan(env, 'a.example.com', 'tok', fakeFetch(200, SUMMARY, seen));
    expect(out).toEqual({ kind: 'done', summary: SUMMARY });
    expect(seen[0]?.url).toBe('https://proj.supabase.test/functions/v1/create-scan');
    expect(seen[0]?.headers.get('apikey')).toBe('anon-key');
    expect(await seen[0]?.json()).toEqual({ url: 'a.example.com', turnstileToken: 'tok' });
  });

  it('passes the server’s plain-English message through', async () => {
    const out = await createScan(
      env,
      'x',
      't',
      fakeFetch(429, {
        error: 'daily_limit',
        message: 'You have used your 3 free scans for today.',
      }),
    );
    expect(out).toEqual({
      kind: 'error',
      code: 'daily_limit',
      message: 'You have used your 3 free scans for today.',
    });
  });

  it.each([
    ['not JSON', '<html>'],
    ['the wrong shape', { grade: 'Z' }],
    ['an over-long title', { ...SUMMARY, topIssues: ['x'.repeat(500)] }],
  ])('rejects %s', async (_name, body) => {
    const out = await createScan(env, 'x', 't', fakeFetch(200, body));
    expect(out).toMatchObject({ kind: 'error', code: 'bad_response' });
  });

  it('reports a network failure plainly', async () => {
    const failing = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
    expect(await createScan(env, 'x', 't', failing)).toMatchObject({
      kind: 'error',
      code: 'network',
    });
  });
});

describe('summarySentence', () => {
  const s = (critical: number, high: number, medium: number, low: number, partial = false) =>
    summarySentence({ counts: { critical, high, medium, low, info: 0 }, partial });
  it.each([
    [s(0, 0, 0, 0), 'We found no problems in the checks we ran.'],
    [
      s(1, 0, 2, 0),
      'One serious problem could let someone take over your app or your data. Fix it first.',
    ],
    [
      s(2, 1, 0, 0),
      '2 serious problems could let someone take over your app or your data. Fix them first.',
    ],
    [s(0, 1, 0, 3), 'One important problem should be fixed soon.'],
    [s(0, 0, 2, 3), '5 smaller problems to tidy up. Nothing urgent.'],
  ])('%s', (actual, expected) => {
    expect(actual).toBe(expected);
  });
  it('says when the grade is partial', () => {
    expect(s(0, 0, 0, 0, true)).toContain('partial');
  });
});
