// Runs the real engine (safeFetch -> collect -> context -> runner) against a fixture
// site on the fake network.

import { COLLECT, RUNNER } from '../../../supabase/functions/_shared/config.ts';
import { ALL_CHECKS } from '../../../supabase/functions/_shared/scanner/checks/index.ts';
import { collect } from '../../../supabase/functions/_shared/scanner/collect.ts';
import { buildContext } from '../../../supabase/functions/_shared/scanner/context.ts';
import { runChecks } from '../../../supabase/functions/_shared/scanner/runner.ts';
import { createSafeFetch } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';
import type { Finding, ScanContext } from '../../../supabase/functions/_shared/scanner/types.ts';
import { fakeNet, type Site } from '../../../fixtures/site.ts';

export interface ScanOptions {
  verified?: boolean;
  /** Only run these checks (default: all). */
  checkIds?: string[];
}

export async function scanSite(
  site: Site,
  options: ScanOptions = {},
): Promise<{ findings: Finding[]; ctx: ScanContext; requested: string[] }> {
  const net = fakeNet(site.routes, site.dns);
  // Short network time limit so "timed out" fixtures finish quickly.
  const fetch = createSafeFetch({
    resolve: net.resolve,
    transport: net.transport,
    userAgent: 'ScannerBot/1.0 (+https://scanner.example.test/bot)',
    limits: { timeoutMs: 300 },
  });
  const collected = await collect(site.start, { fetch, limits: COLLECT });
  const ctx = buildContext(collected, { verified: options.verified ?? false, fetch });
  const checks = options.checkIds
    ? ALL_CHECKS.filter((c) => options.checkIds?.includes(c.id))
    : ALL_CHECKS;
  const modes = Object.fromEntries(checks.map((c) => [c.id, 'live' as const]));
  const { findings } = await runChecks(checks, ctx, {
    modes,
    defaultTimeoutMs: RUNNER.defaultCheckTimeoutMs,
    deepChecksEnabled: true,
  });
  return { findings, ctx, requested: net.requested };
}
