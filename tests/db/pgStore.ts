// A ScanStore that calls the same SQL functions as the Supabase adapter, directly over
// Postgres as service_role. Lets the end-to-end test run without a Supabase stack.

import type pg from 'pg';
import {
  type CreateScanRow,
  type ScanRow,
  type ScanStore,
  toClaimedScan,
  toCreateResult,
} from '../../supabase/functions/_shared/store.ts';

export function pgStore(client: pg.Client): ScanStore {
  async function asService<R extends pg.QueryResultRow>(
    sql: string,
    params: unknown[],
  ): Promise<R[]> {
    await client.query('set role service_role');
    try {
      return (await client.query<R>(sql, params)).rows;
    } finally {
      await client.query('reset role');
    }
  }
  return {
    async createScan(i) {
      const rows = await asService<CreateScanRow>(
        'select * from public.create_scan_with_limits($1, $2, $3, null, $4, $5, $6, $7)',
        [i.url, i.host, i.userId, i.kind, i.clientIpHash, i.dailyLimit, i.hostCooldownSeconds],
      );
      return toCreateResult(rows[0]);
    },
    async claimScan(scanId) {
      return toClaimedScan(
        (await asService<ScanRow>('select * from public.claim_scan($1)', [scanId]))[0],
      );
    },
    async completeScan(scanId, findings, grade, score) {
      const rows = await asService<{ ok: boolean }>(
        'select public.complete_scan($1, $2::jsonb, $3, $4) as ok',
        [scanId, JSON.stringify(findings), grade, score],
      );
      return rows[0]?.ok === true;
    },
    async failScan(scanId, errorCode) {
      const rows = await asService<{ ok: boolean }>('select public.fail_scan($1, $2) as ok', [
        scanId,
        errorCode,
      ]);
      return rows[0]?.ok === true;
    },
  };
}
