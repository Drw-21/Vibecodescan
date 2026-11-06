// run-scan endpoint: runs one queued scan. Service role only (weekly-rescan and internal
// callers); browsers can never call it. Running the same scan twice does nothing the
// second time (the claim step).

import { json, problem, safeEqual } from '../_shared/http.ts';
import type { RunScanResult } from '../_shared/runScan.ts';
import { RunScanBody, readJson } from '../_shared/validate.ts';

export interface RunScanEndpointDeps {
  serviceRoleKey: string;
  runScan: (scanId: string) => Promise<RunScanResult>;
}

export function runScanHandler(deps: RunScanEndpointDeps): (req: Request) => Promise<Response> {
  const none = 'null';
  return async (req) => {
    if (req.method !== 'POST') return problem(405, 'method_not_allowed', 'Use POST.', none);
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
    if (deps.serviceRoleKey === '' || !safeEqual(token, deps.serviceRoleKey)) {
      return problem(401, 'unauthorised', 'Not allowed.', none);
    }
    let scanId: string;
    try {
      const parsed = RunScanBody.safeParse(await readJson(req));
      if (!parsed.success) return problem(400, 'invalid_body', 'Send a scanId.', none);
      scanId = parsed.data.scanId;
    } catch {
      return problem(400, 'invalid_body', 'Send a scanId.', none);
    }
    let result: RunScanResult;
    try {
      result = await deps.runScan(scanId);
    } catch {
      return problem(500, 'internal', 'Scan could not be run.', none);
    }
    return json(
      200,
      result.status === 'failed'
        ? { status: 'failed', errorCode: result.errorCode }
        : { status: result.status },
      none,
    );
  };
}
