// run-scan's job (spec: "A scan, step by step", 3–4): claim the scan, run the engine once
// against the page, score it and save everything — or mark it failed with an error code.
// Shared by the create-scan function (in the background) and the run-scan endpoint.

import { CHECK_MODES, COLLECT, RUNNER, SCAN } from './config.ts';
import type { Logger } from './log.ts';
import { ALL_CHECKS } from './scanner/checks/index.ts';
import { collect } from './scanner/collect.ts';
import { buildContext } from './scanner/context.ts';
import { safeEvidence } from './scanner/redact.ts';
import { runChecks } from './scanner/runner.ts';
import { type ScoreResult, score } from './scanner/score.ts';
import { type Finding, type SafeFetch, SafeFetchError } from './scanner/types.ts';
import type { OwnedSite, ScanStore, StoredFinding } from './store.ts';

export interface RunScanDeps {
  store: ScanStore;
  fetch: SafeFetch;
  log: Logger;
  /**
   * Re-checks ownership right before a deep scan (spec: "re-checked before each deep scan").
   * Without it, deep checks never run.
   */
  verifySite?: (site: OwnedSite) => Promise<boolean>;
  maxDurationMs?: number;
}

export type RunScanResult =
  | { status: 'skipped' }
  | { status: 'done'; findings: Finding[]; result: ScoreResult }
  | { status: 'failed'; errorCode: string };

class ScanTimeout extends Error {}

export async function runScan(scanId: string, deps: RunScanDeps): Promise<RunScanResult> {
  const { store, log } = deps;
  const started = Date.now();
  // One switch that stops every request of this scan when the whole-scan deadline passes.
  const stop = new AbortController();
  const fetch: SafeFetch = (url, init = {}) =>
    deps.fetch(url, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, stop.signal]) : stop.signal,
    });

  let claimed = false;
  try {
    const scan = await store.claimScan(scanId);
    if (!scan) {
      log.info('scan not claimable (already run or unknown)', { scan_id: scanId });
      return { status: 'skipped' };
    }
    claimed = true;
    log.info('scan started', { scan_id: scanId, kind: scan.kind });

    const verified = await stillVerified(scan, deps);
    const { findings, shadow } = await withDeadline(
      engine(scan.url, fetch, verified),
      deps.maxDurationMs ?? SCAN.maxDurationMs,
      stop,
    );
    const result = score(findings);
    const saved = await store.completeScan(
      scanId,
      findings.map(toStored),
      result.grade,
      result.score,
    );
    if (!saved) {
      log.error('scan was no longer running when saving', { scan_id: scanId });
      return { status: 'skipped' };
    }
    for (const f of shadow) {
      log.info('shadow finding', {
        scan_id: scanId,
        check_id: f.checkId,
        status: f.status,
        severity: f.severity,
      });
    }
    log.info('scan done', {
      scan_id: scanId,
      grade: result.grade,
      score: result.score,
      partial: result.partial,
      duration_ms: Date.now() - started,
    });
    return { status: 'done', findings, result };
  } catch (error) {
    const errorCode = toErrorCode(error);
    log.error('scan failed', {
      scan_id: scanId,
      error_code: errorCode,
      duration_ms: Date.now() - started,
    });
    // If this call never claimed the scan, another call may be running it: only a scan
    // that is still queued may be failed then.
    await store.failScan(scanId, errorCode, !claimed).catch(() => {
      log.error('could not mark scan failed', { scan_id: scanId });
    });
    return { status: 'failed', errorCode };
  } finally {
    stop.abort();
  }
}

/**
 * True only for a deep scan of a site that is verified AND still passes the ownership check
 * now. If the check fails, the site loses its verified status and the scan runs passive only.
 */
async function stillVerified(
  scan: { id: string; kind: string; siteId: string | null; userId: string | null },
  deps: RunScanDeps,
): Promise<boolean> {
  if (scan.kind !== 'deep' || !scan.siteId || !scan.userId || !deps.verifySite) return false;
  const site = await deps.store.siteForOwner(scan.siteId, scan.userId);
  if (!site?.verifiedAt) return false;
  const ok = await deps.verifySite(site).catch(() => false);
  if (!ok) {
    await deps.store.setSiteVerified(site.id, false);
    deps.log.info('ownership no longer proven; deep checks skipped', { scan_id: scan.id });
  }
  return ok;
}

async function engine(url: string, fetch: SafeFetch, verified: boolean) {
  const collected = await collect(url, { fetch, limits: COLLECT });
  const ctx = buildContext(collected, { verified, fetch });
  return runChecks(ALL_CHECKS, ctx, {
    modes: CHECK_MODES,
    defaultTimeoutMs: RUNNER.defaultCheckTimeoutMs,
    deepChecksEnabled: RUNNER.deepChecksEnabled,
  });
}

function withDeadline<T>(work: Promise<T>, ms: number, stop: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      stop.abort(); // really stop the scan's requests, not just report a timeout
      reject(new ScanTimeout('scan took too long'));
    }, ms);
  });
  return Promise.race([work, deadline]).finally(() => {
    clearTimeout(timer);
  });
}

function toStored(f: Finding): StoredFinding {
  return {
    check_id: f.checkId,
    severity: f.severity,
    status: f.status,
    title: f.title,
    explanation: f.explanation,
    // Checks already redact; this is a second, independent safety net.
    evidence_redacted: f.evidenceRedacted === undefined ? null : safeEvidence(f.evidenceRedacted),
    fix_prompt: null, // fix prompts arrive in milestone 7
  };
}

function toErrorCode(error: unknown): string {
  if (error instanceof ScanTimeout) return 'scan_timeout';
  if (error instanceof SafeFetchError) return `fetch_${error.code}`;
  return 'internal';
}
