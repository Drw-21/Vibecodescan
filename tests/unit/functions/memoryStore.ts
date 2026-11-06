// An in-memory ScanStore that behaves like the SQL functions, for handler tests.
// The SQL functions themselves are tested against Postgres in tests/db.

import type {
  ClaimedScan,
  CreateScanInput,
  CreateScanResult,
  ScanStore,
  StoredFinding,
} from '../../../supabase/functions/_shared/store.ts';

export interface MemoryScan extends ClaimedScan {
  status: 'queued' | 'running' | 'done' | 'failed';
  clientIpHash: string | null;
  grade?: string;
  score?: number;
  errorCode?: string;
  findings: StoredFinding[];
}

export class MemoryStore implements ScanStore {
  scans = new Map<string, MemoryScan>();
  inputs: CreateScanInput[] = [];
  /** Force the next createScan outcome. */
  nextOutcome: CreateScanResult | undefined;

  createScan(input: CreateScanInput): Promise<CreateScanResult> {
    this.inputs.push(input);
    if (this.nextOutcome) return Promise.resolve(this.nextOutcome);
    const id = crypto.randomUUID();
    this.scans.set(id, {
      id,
      url: input.url,
      host: input.host,
      kind: input.kind,
      userId: input.userId,
      siteId: null,
      status: 'queued',
      clientIpHash: input.clientIpHash,
      findings: [],
    });
    return Promise.resolve({ outcome: 'ok', scanId: id });
  }

  claimScan(scanId: string): Promise<ClaimedScan | null> {
    const scan = this.scans.get(scanId);
    if (scan?.status !== 'queued') return Promise.resolve(null);
    scan.status = 'running';
    return Promise.resolve(scan);
  }

  completeScan(
    scanId: string,
    findings: StoredFinding[],
    grade: string,
    score: number,
  ): Promise<boolean> {
    const scan = this.scans.get(scanId);
    if (scan?.status !== 'running') return Promise.resolve(false);
    Object.assign(scan, { status: 'done', grade, score, findings });
    return Promise.resolve(true);
  }

  failScan(scanId: string, errorCode: string, onlyIfQueued: boolean): Promise<boolean> {
    const scan = this.scans.get(scanId);
    const allowed = scan?.status === 'queued' || (scan?.status === 'running' && !onlyIfQueued);
    if (!scan || !allowed) return Promise.resolve(false);
    Object.assign(scan, { status: 'failed', errorCode });
    return Promise.resolve(true);
  }
}
