// create-scan (spec: "A scan, step by step", 1–2): validate the URL, check the captcha and
// the limits, insert the scan, and run it.
//   - Anonymous visitors cannot read the scans table (RLS), so for them this function waits
//     for the result and returns the Free summary once (grade, counts, top 3 titles).
//   - Signed-in users get the scan id at once; the scan runs in the background and the
//     browser watches the row.

import { LIMITS } from '../_shared/config.ts';
import { corsHeaders, json, problem } from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import type { RunScanResult } from '../_shared/runScan.ts';
import type { ScanStore } from '../_shared/store.ts';
import { failureMessage, freeSummary } from '../_shared/summary.ts';
import { CreateScanBody, normaliseScanUrl, readJson } from '../_shared/validate.ts';

export interface CreateScanDeps {
  store: ScanStore;
  userIdFromRequest: (req: Request) => Promise<string | null>;
  verifyTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  clientIp: (req: Request) => string | null;
  hashIp: (ip: string) => Promise<string>;
  runScan: (scanId: string) => Promise<RunScanResult>;
  /** Keeps work alive after the response is sent (EdgeRuntime.waitUntil). */
  background: (work: Promise<unknown>) => void;
  allowedOrigin: string;
  log: Logger;
}

export function createScanHandler(deps: CreateScanDeps): (req: Request) => Promise<Response> {
  const origin = deps.allowedOrigin;
  const handle = handler(deps);
  return async (req) => {
    try {
      return await handle(req);
    } catch (error) {
      deps.log.error('create-scan failed', { error: errorName(error) });
      return problem(
        500,
        'internal',
        'Something went wrong on our side. Please try again.',
        origin,
      );
    }
  };
}

/** Only the error's class name: messages can contain database details or user input. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function handler(deps: CreateScanDeps): (req: Request) => Promise<Response> {
  const origin = deps.allowedOrigin;
  return async (req) => {
    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (req.method !== 'POST') return problem(405, 'method_not_allowed', 'Use POST.', origin);
    const requestOrigin = req.headers.get('origin');
    if (requestOrigin !== null && requestOrigin !== origin) {
      return problem(
        403,
        'forbidden_origin',
        'Scans can only be started from our website.',
        origin,
      );
    }

    let body: CreateScanBody;
    try {
      const parsed = CreateScanBody.safeParse(await readJson(req));
      if (!parsed.success)
        return problem(400, 'invalid_body', 'Please send a website address.', origin);
      body = parsed.data;
    } catch {
      return problem(400, 'invalid_body', 'Please send a website address.', origin);
    }

    const target = normaliseScanUrl(body.url);
    if (!target) {
      return problem(
        400,
        'invalid_url',
        'That does not look like a public website address, for example myapp.lovable.app.',
        origin,
      );
    }

    const userId = await deps.userIdFromRequest(req);
    const ip = deps.clientIp(req);
    if (userId === null) {
      // Without a trusted IP there is no per-visitor limit for an anonymous scan: refuse.
      if (ip === null) {
        return problem(
          403,
          'no_client_ip',
          'We could not check your connection. Please try again, or sign in to scan.',
          origin,
        );
      }
      const human =
        body.turnstileToken !== undefined && (await deps.verifyTurnstile(body.turnstileToken, ip));
      if (!human)
        return problem(
          403,
          'captcha_failed',
          'Please complete the “I am human” check and try again.',
          origin,
        );
    }

    const created = await deps.store.createScan({
      url: target.url,
      host: target.host,
      userId,
      kind: 'passive',
      clientIpHash: ip === null ? null : await deps.hashIp(ip),
      dailyLimit: LIMITS.freeScansPerDay,
      hostCooldownSeconds: LIMITS.hostCooldownSeconds,
    });
    if (created.outcome !== 'ok') {
      const retry = { 'retry-after': String(Math.max(1, created.retryAfterSeconds)) };
      return created.outcome === 'daily_limit'
        ? problem(
            429,
            'daily_limit',
            `You have used your ${String(LIMITS.freeScansPerDay)} free scans for today. They reset at midnight UTC.`,
            origin,
            retry,
          )
        : problem(
            429,
            'host_cooldown',
            'This app was scanned a few minutes ago. Please wait a little and try again.',
            origin,
            retry,
          );
    }
    deps.log.info('scan created', { scan_id: created.scanId, anonymous: userId === null });

    if (userId !== null) {
      deps.background(deps.runScan(created.scanId));
      return json(202, { scanId: created.scanId, status: 'queued' }, origin);
    }

    const run = await deps.runScan(created.scanId);
    if (run.status === 'done')
      return json(200, freeSummary(created.scanId, run.findings, run.result), origin);
    const code = run.status === 'failed' ? run.errorCode : 'internal';
    return json(
      200,
      { scanId: created.scanId, status: 'failed', error: code, message: failureMessage(code) },
      origin,
    );
  };
}
