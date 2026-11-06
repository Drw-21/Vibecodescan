// The only way the scan functions touch the database. db.ts provides the Supabase
// (service-role) implementation; tests provide a Postgres one. Every method is one call
// to a SQL function (migration 20261106000100), so the logic lives — and is tested — in SQL.

import type { Severity, FindingStatus } from './scanner/types.ts';

export type ScanKind = 'passive' | 'deep';

export interface CreateScanInput {
  url: string;
  host: string;
  userId: string | null;
  kind: ScanKind;
  clientIpHash: string | null;
  dailyLimit: number;
  hostCooldownSeconds: number;
}

export type CreateScanResult =
  | { outcome: 'ok'; scanId: string }
  | { outcome: 'daily_limit' | 'host_cooldown'; retryAfterSeconds: number };

export interface ClaimedScan {
  id: string;
  url: string;
  host: string;
  kind: ScanKind;
  userId: string | null;
  siteId: string | null;
}

export interface StoredFinding {
  check_id: string;
  severity: Severity;
  status: FindingStatus;
  title: string;
  explanation: string;
  evidence_redacted: string | null;
  fix_prompt: string | null;
}

export interface ScanStore {
  createScan(input: CreateScanInput): Promise<CreateScanResult>;
  /** Null if the scan does not exist or was already claimed. */
  claimScan(scanId: string): Promise<ClaimedScan | null>;
  /** False if the scan was not running (already finished or never claimed). */
  completeScan(
    scanId: string,
    findings: StoredFinding[],
    grade: string,
    score: number,
  ): Promise<boolean>;
  /**
   * onlyIfQueued: true when this call never claimed the scan (it may be running elsewhere).
   */
  failScan(scanId: string, errorCode: string, onlyIfQueued: boolean): Promise<boolean>;
}

/** Rows as the SQL functions return them. */
export interface CreateScanRow {
  scan_id: string | null;
  outcome: string;
  retry_after_seconds: number;
}
export interface ScanRow {
  id: string;
  url: string;
  host: string;
  kind: string;
  user_id: string | null;
  site_id: string | null;
}

export function toCreateResult(row: CreateScanRow | undefined): CreateScanResult {
  if (!row) throw new Error('create_scan_with_limits returned no row');
  if (row.outcome === 'ok' && row.scan_id) return { outcome: 'ok', scanId: row.scan_id };
  if (row.outcome === 'daily_limit' || row.outcome === 'host_cooldown') {
    return { outcome: row.outcome, retryAfterSeconds: row.retry_after_seconds };
  }
  throw new Error(`unexpected outcome ${row.outcome}`);
}

export function toClaimedScan(row: ScanRow | undefined): ClaimedScan | null {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    host: row.host,
    kind: row.kind === 'deep' ? 'deep' : 'passive',
    userId: row.user_id,
    siteId: row.site_id,
  };
}
