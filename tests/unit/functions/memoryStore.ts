// An in-memory ScanStore that behaves like the SQL functions, for handler tests.
// The SQL functions themselves are tested against Postgres in tests/db.

import type {
  ClaimedScan,
  OwnedSite,
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
  sites = new Map<string, OwnedSite & { userId: string; lastAttempt: number }>();
  rotated: string[] = [];

  addSite(userId: string, site: Partial<OwnedSite> & { url: string }): OwnedSite {
    const full = {
      id: crypto.randomUUID(),
      host: new URL(site.url).hostname,
      verifyToken: 'a'.repeat(64),
      verifyTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      verifiedAt: null,
      ...site,
      userId,
      lastAttempt: 0,
    };
    this.sites.set(full.id, full);
    return full;
  }

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
      siteId: input.siteId,
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

  siteForOwner(siteId: string, userId: string): Promise<OwnedSite | null> {
    const site = this.sites.get(siteId);
    return Promise.resolve(site?.userId === userId ? site : null);
  }

  beginVerifyAttempt(
    siteId: string,
    userId: string,
    cooldownSeconds: number,
    hostSitesPerMinute: number,
  ): Promise<boolean> {
    const site = this.sites.get(siteId);
    if (site?.userId !== userId) return Promise.resolve(false);
    if (Date.now() - site.lastAttempt < cooldownSeconds * 1000) return Promise.resolve(false);
    const busy = [...this.sites.values()].filter(
      (other) =>
        other.id !== siteId && other.host === site.host && Date.now() - other.lastAttempt < 60_000,
    ).length;
    if (busy >= hostSitesPerMinute) return Promise.resolve(false);
    site.lastAttempt = Date.now();
    return Promise.resolve(true);
  }

  setSiteVerified(
    siteId: string,
    verified: boolean,
    checked?: { host: string; token: string },
  ): Promise<boolean> {
    const site = this.sites.get(siteId);
    if (!site) return Promise.resolve(false);
    if (verified && (site.host !== checked?.host || site.verifyToken !== checked.token)) {
      return Promise.resolve(false);
    }
    site.verifiedAt = verified ? new Date().toISOString() : null;
    return Promise.resolve(true);
  }

  rotateSiteToken(siteId: string): Promise<boolean> {
    const site = this.sites.get(siteId);
    if (!site || site.verifiedAt) return Promise.resolve(false);
    site.verifyToken = 'b'.repeat(64);
    site.verifyTokenExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    this.rotated.push(siteId);
    return Promise.resolve(true);
  }
}
