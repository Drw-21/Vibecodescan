// Edge Function entry point: wires real services into the tested handler.

import { serviceClient, supabaseStore } from '../_shared/db.ts';
import { env, productionSafeFetch } from '../_shared/deno.ts';
import { consoleLogger } from '../_shared/log.ts';
import { runScan } from '../_shared/runScan.ts';
import { runScanHandler } from './handler.ts';

const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
const store = supabaseStore(serviceClient(env('SUPABASE_URL'), serviceRoleKey));
const fetch = productionSafeFetch();

Deno.serve(
  runScanHandler({
    serviceRoleKey,
    runScan: (scanId) => runScan(scanId, { store, fetch, log: consoleLogger }),
  }),
);
