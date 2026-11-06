import { describe, expect, it } from 'vitest';
import type { CheckMode } from '../../../supabase/functions/_shared/config.ts';
import { runChecks } from '../../../supabase/functions/_shared/scanner/runner.ts';
import type {
  Check,
  Finding,
  ScanContext,
  SafeFetch,
} from '../../../supabase/functions/_shared/scanner/types.ts';

const noFetch: SafeFetch = () => Promise.reject(new Error('no network in this test'));

function ctx(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    url: new URL('https://app.example.test/'),
    html: '',
    headers: new Headers(),
    bundles: [],
    bundlesComplete: true,
    platform: 'unknown',
    backend: {},
    verified: false,
    fetch: noFetch,
    ...overrides,
  };
}

function pass(checkId: string): Finding {
  return {
    checkId,
    status: 'pass',
    severity: 'low',
    title: 't',
    explanation: 'e',
    fixKey: checkId,
  };
}

function check(id: string, run: Check['run'], extra: Partial<Check> = {}): Check {
  return { id, title: `Check ${id}`, requiresVerification: false, timeoutMs: 1000, run, ...extra };
}

function options(modes: Record<string, CheckMode>, extra: { deepChecksEnabled?: boolean } = {}) {
  return { modes, defaultTimeoutMs: 1000, deepChecksEnabled: extra.deepChecksEnabled ?? true };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runChecks', () => {
  it('runs every live check and collects its findings', async () => {
    const checks = [
      check('a', () => Promise.resolve([pass('a')])),
      check('b', () => Promise.resolve([pass('b')])),
    ];
    const result = await runChecks(checks, ctx(), options({ a: 'live', b: 'live' }));
    expect(result.findings.map((f) => f.checkId)).toEqual(['a', 'b']);
    expect(result.shadow).toEqual([]);
  });

  it('runs checks in parallel', async () => {
    const slow = (id: string) =>
      check(id, async () => {
        await sleep(100);
        return [pass(id)];
      });
    const started = Date.now();
    await runChecks(
      [slow('a'), slow('b'), slow('c')],
      ctx(),
      options({ a: 'live', b: 'live', c: 'live' }),
    );
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('reports a check that throws as incomplete, never as passed', async () => {
    const result = await runChecks(
      [check('boom', () => Promise.reject(new Error('kaboom')))],
      ctx(),
      options({ boom: 'live' }),
    );
    expect(result.findings).toEqual([
      expect.objectContaining({ checkId: 'boom', status: 'incomplete' }),
    ]);
    expect(JSON.stringify(result.findings)).not.toContain('kaboom');
  });

  it('reports a check that times out as incomplete and aborts its network requests', async () => {
    let aborted = false;
    const fetchSpy: SafeFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const hanging = check(
      'slow',
      async (c) => {
        await c.fetch('https://app.example.test/x');
        return [pass('slow')];
      },
      { timeoutMs: 50 },
    );
    const result = await runChecks([hanging], ctx({ fetch: fetchSpy }), options({ slow: 'live' }));
    expect(result.findings).toEqual([
      expect.objectContaining({ checkId: 'slow', status: 'incomplete' }),
    ]);
    expect(aborted).toBe(true);
  });

  it('treats a check that returns no findings as incomplete', async () => {
    const result = await runChecks(
      [check('empty', () => Promise.resolve([]))],
      ctx(),
      options({ empty: 'live' }),
    );
    expect(result.findings).toEqual([
      expect.objectContaining({ checkId: 'empty', status: 'incomplete' }),
    ]);
  });

  it('treats a check that reports under another check’s id as incomplete', async () => {
    const result = await runChecks(
      [check('a', () => Promise.resolve([pass('b')]))],
      ctx(),
      options({ a: 'live' }),
    );
    expect(result.findings).toEqual([
      expect.objectContaining({ checkId: 'a', status: 'incomplete' }),
    ]);
  });

  it('never runs a deep check on an unverified site', async () => {
    let ran = false;
    const deep = check(
      'deep',
      () => {
        ran = true;
        return Promise.resolve([pass('deep')]);
      },
      { requiresVerification: true },
    );
    const result = await runChecks([deep], ctx({ verified: false }), options({ deep: 'live' }));
    expect(ran).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('runs a deep check on a verified site', async () => {
    const deep = check('deep', () => Promise.resolve([pass('deep')]), {
      requiresVerification: true,
    });
    const result = await runChecks([deep], ctx({ verified: true }), options({ deep: 'live' }));
    expect(result.findings).toHaveLength(1);
  });

  it('skips every deep check when the deep-scan kill switch is off', async () => {
    let ran = false;
    const deep = check(
      'deep',
      () => {
        ran = true;
        return Promise.resolve([pass('deep')]);
      },
      { requiresVerification: true },
    );
    await runChecks(
      [deep],
      ctx({ verified: true }),
      options({ deep: 'live' }, { deepChecksEnabled: false }),
    );
    expect(ran).toBe(false);
  });

  it('does not run checks that are off or missing from config (fail closed)', async () => {
    let ran = 0;
    const counting = (id: string) =>
      check(id, () => {
        ran++;
        return Promise.resolve([pass(id)]);
      });
    const result = await runChecks(
      [counting('off'), counting('unlisted')],
      ctx(),
      options({ off: 'off' }),
    );
    expect(ran).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it('keeps shadow-mode results apart from what users see', async () => {
    const result = await runChecks(
      [
        check('live1', () => Promise.resolve([pass('live1')])),
        check('new1', () => Promise.resolve([pass('new1')])),
      ],
      ctx(),
      options({ live1: 'live', new1: 'shadow' }),
    );
    expect(result.findings.map((f) => f.checkId)).toEqual(['live1']);
    expect(result.shadow.map((f) => f.checkId)).toEqual(['new1']);
  });

  it('refuses two checks with the same id (programming error)', async () => {
    const a = check('dup', () => Promise.resolve([pass('dup')]));
    await expect(runChecks([a, a], ctx(), options({ dup: 'live' }))).rejects.toThrow(/duplicate/i);
  });
});
