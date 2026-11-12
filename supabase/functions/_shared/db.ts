// Service-role Supabase client (server only). Never import this from web/.

import { createClient } from '@supabase/supabase-js';
import {
  type CreateScanRow,
  type OwnedSiteRow,
  type ScanRow,
  type ScanStore,
  toClaimedScan,
  toCreateResult,
  toOwnedSite,
} from './store.ts';

interface RpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/** The small part of the Supabase client we use, with strict types. */
export interface ServiceClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export function serviceClient(
  url: string,
  serviceRoleKey: string,
  fetchImpl?: typeof fetch,
): ServiceClient {
  const client: unknown = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
  return client as ServiceClient;
}

async function call(
  client: ServiceClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ''} ${error.message}`);
  return data;
}

export function supabaseStore(client: ServiceClient): ScanStore {
  return {
    async createScan(input) {
      const data = await call(client, 'create_scan_with_limits', {
        p_url: input.url,
        p_host: input.host,
        p_user_id: input.userId,
        p_site_id: input.siteId,
        p_kind: input.kind,
        p_client_ip_hash: input.clientIpHash,
        p_daily_limit: input.dailyLimit,
        p_host_cooldown_seconds: input.hostCooldownSeconds,
      });
      return toCreateResult((data as CreateScanRow[] | null)?.[0]);
    },
    async claimScan(scanId) {
      const data = await call(client, 'claim_scan', { p_scan_id: scanId });
      return toClaimedScan((data as ScanRow[] | null)?.[0]);
    },
    async completeScan(scanId, findings, grade, score) {
      const data = await call(client, 'complete_scan', {
        p_scan_id: scanId,
        p_findings: findings,
        p_grade: grade,
        p_score: score,
      });
      return data === true;
    },
    async siteForOwner(siteId, userId) {
      const data = await call(client, 'site_for_owner', { p_site_id: siteId, p_user_id: userId });
      return toOwnedSite((data as OwnedSiteRow[] | null)?.[0]);
    },
    async beginVerifyAttempt(siteId, userId, cooldownSeconds) {
      const data = await call(client, 'begin_verify_attempt', {
        p_site_id: siteId,
        p_user_id: userId,
        p_cooldown_seconds: cooldownSeconds,
      });
      return data === true;
    },
    async setSiteVerified(siteId, verified, checked) {
      const data = await call(client, 'set_site_verified', {
        p_site_id: siteId,
        p_verified: verified,
        p_host: checked?.host ?? null,
        p_token: checked?.token ?? null,
      });
      return data === true;
    },
    async rotateSiteToken(siteId) {
      const data = await call(client, 'rotate_site_token', { p_site_id: siteId });
      return data === true;
    },
    async failScan(scanId, errorCode, onlyIfQueued) {
      const data = await call(client, 'fail_scan', {
        p_scan_id: scanId,
        p_error_code: errorCode,
        p_only_queued: onlyIfQueued,
      });
      return data === true;
    },
  };
}

/** The signed-in user's id from the request's bearer token, or null for anonymous visitors. */
export async function userIdFromRequest(
  client: ServiceClient,
  req: Request,
): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}
