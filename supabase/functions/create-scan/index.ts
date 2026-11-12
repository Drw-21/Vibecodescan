// Edge Function entry point: wires real services into the tested handler.

import { clientIp, hashIp } from '../_shared/clientIp.ts';
import { serviceClient, supabaseStore, userIdFromRequest } from '../_shared/db.ts';
import { background, env, productionSafeFetch, txtLookup } from '../_shared/deno.ts';
import { consoleLogger } from '../_shared/log.ts';
import { runScan } from '../_shared/runScan.ts';
import { verifyOwnership } from '../_shared/verify.ts';
import { createTurnstileVerifier } from '../_shared/turnstile.ts';
import { createScanHandler } from './handler.ts';

const client = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const store = supabaseStore(client);
const ipSecret = env('IP_HASH_SECRET');
const fetch = productionSafeFetch();

Deno.serve(
  createScanHandler({
    store,
    userIdFromRequest: (req) => userIdFromRequest(client, req),
    verifyTurnstile: createTurnstileVerifier({ secret: env('TURNSTILE_SECRET_KEY') }),
    clientIp,
    hashIp: (ip) => hashIp(ip, ipSecret),
    runScan: (scanId) =>
      runScan(scanId, {
        store,
        fetch,
        log: consoleLogger,
        verifySite: async (site) =>
          (
            await verifyOwnership(
              { url: site.url, host: site.host, token: site.verifyToken },
              { fetch, lookupTxt: txtLookup },
            )
          ).verified,
      }),
    background,
    allowedOrigin: env('SITE_ORIGIN'),
    log: consoleLogger,
  }),
);
