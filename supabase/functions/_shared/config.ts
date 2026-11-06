// Every limit, weight and switch in one place (spec: "Config, not code").
// No secrets here, ever: those come from environment variables at the call site.

import type { Severity } from './scanner/types.ts';

/** safeFetch: the only way the engine touches the network. */
export const SAFE_FETCH = {
  allowedPorts: [80, 443],
  maxRedirects: 5,
  maxBytesPerResponse: 2 * 1024 * 1024,
  timeoutMs: 8_000,
  /** Product name in the User-Agent; the domain comes from SCANNER_BOT_DOMAIN. */
  userAgentProduct: 'ScannerBot/1.0',
} as const;

/** Builds the User-Agent, e.g. "ScannerBot/1.0 (+https://example.com/bot)". */
export function userAgent(botDomain: string): string {
  return `${SAFE_FETCH.userAgentProduct} (+https://${botDomain}/bot)`;
}

/** Collect phase: load the page and its bundles once. */
export const COLLECT = {
  maxBundles: 25,
  maxBytesPerBundle: SAFE_FETCH.maxBytesPerResponse,
  maxTotalBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
  /** How many bundles are fetched at the same time. */
  bundleConcurrency: 4,
} as const;

export const RUNNER = {
  defaultCheckTimeoutMs: 8_000,
  /** Kill switch for the whole deep-scan feature. */
  deepChecksEnabled: true,
} as const;

/**
 * Lifecycle state of each check (spec: "New check lifecycle").
 * - live: runs, shown to users
 * - shadow: runs, results logged but hidden from users
 * - off: does not run (kill switch)
 * A check missing from this list does not run.
 */
export type CheckMode = 'live' | 'shadow' | 'off';

export const CHECK_MODES: Readonly<Record<string, CheckMode>> = {
  'secret-in-bundle': 'live',
  'exposed-files': 'live',
  'source-maps': 'live',
  'security-headers': 'live',
  https: 'live',
  'cookie-flags': 'live',
  'platform-detect': 'live',
  // Deep checks (supabase-public-tables, firebase-open-rules) arrive in milestone 6.
};

/** Points lost per failed finding (spec: "Scoring and fix prompts"). */
export const SCORE_WEIGHTS: Readonly<Record<Severity, number>> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
};

/** Minimum score for each grade, best first. Anything lower is F. */
export const GRADE_THRESHOLDS = [
  { grade: 'A', min: 90 },
  { grade: 'B', min: 75 },
  { grade: 'C', min: 60 },
  { grade: 'D', min: 40 },
] as const;
