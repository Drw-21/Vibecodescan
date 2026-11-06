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
import type { ScanStore, StoredFinding } from './store.ts';

export interface RunScanDeps {
  store: ScanStore;
  fetch: SafeFetch;
  log: Logger;
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

    const { findings, shadow } = await withDeadline(
      engine(scan.url, fetch),
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

async function engine(url: string, fetch: SafeFetch) {
  const collected = await collect(url, { fetch, limits: COLLECT });
  // Deep checks need ownership re-verified before every deep scan: milestone 6.
  const ctx = buildContext(collected, { verified: false, fetch });
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
