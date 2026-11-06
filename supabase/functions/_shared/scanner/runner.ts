// Runs checks against one collected snapshot (spec: "Runner rules").
//   - all checks in parallel (Promise.allSettled), each with its own time limit
//   - an error, a timeout, no findings, or findings under the wrong id => "incomplete",
//     never "pass" (fail safe, not open)
//   - deep checks only on verified sites, and only while the deep-scan switch is on
//   - checks that are "off" or not listed in config do not run (fail closed)
// The runner never changes when a check is added (open/closed).

import type { CheckMode } from '../config.ts';
import type { Check, Finding, SafeFetch, ScanContext } from './types.ts';

export interface RunOptions {
  modes: Readonly<Record<string, CheckMode>>;
  defaultTimeoutMs: number;
  deepChecksEnabled: boolean;
}

export interface RunResult {
  /** Shown to users and scored. */
  findings: Finding[];
  /** Shadow-mode checks: logged for review, hidden from users, not scored. */
  shadow: Finding[];
}

export async function runChecks(
  checks: readonly Check[],
  ctx: ScanContext,
  options: RunOptions,
): Promise<RunResult> {
  const ids = new Set<string>();
  for (const check of checks) {
    if (ids.has(check.id)) throw new Error(`duplicate check id: ${check.id}`);
    ids.add(check.id);
  }

  const selected = checks.filter((check) => {
    const mode = options.modes[check.id] ?? 'off';
    if (mode === 'off') return false;
    if (check.requiresVerification && !(ctx.verified && options.deepChecksEnabled)) return false;
    return true;
  });

  const settled = await Promise.allSettled(
    selected.map((check) =>
      runOne(check, ctx, check.timeoutMs > 0 ? check.timeoutMs : options.defaultTimeoutMs),
    ),
  );

  const result: RunResult = { findings: [], shadow: [] };
  settled.forEach((outcome, i) => {
    const check = selected[i];
    if (!check) return;
    const findings =
      outcome.status === 'fulfilled' ? validate(check, outcome.value) : [incomplete(check)];
    const target = options.modes[check.id] === 'shadow' ? result.shadow : result.findings;
    target.push(...findings);
  });
  return result;
}

async function runOne(check: Check, ctx: ScanContext, timeoutMs: number): Promise<Finding[]> {
  const controller = new AbortController();
  // The check's network requests stop when its time runs out.
  const fetch: SafeFetch = (url, init = {}) =>
    ctx.fetch(url, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`check ${check.id} timed out`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([check.run({ ...ctx, fetch }), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** A check must report at least one finding, all under its own id. */
function validate(check: Check, findings: Finding[]): Finding[] {
  if (findings.length === 0 || findings.some((f) => f.checkId !== check.id))
    return [incomplete(check)];
  return findings;
}

/** What users see when a check could not finish. Never includes error text (it may echo the scanned site). */
export function incomplete(check: Check): Finding {
  return {
    checkId: check.id,
    status: 'incomplete',
    severity: 'info',
    title: `${check.title}: could not complete`,
    explanation:
      'We could not finish this check, so we are not counting it as passed. Your grade is partial. Try rescanning in a few minutes.',
    fixKey: 'incomplete',
  };
}
