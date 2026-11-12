// Edge Function entry point: wires real services into the tested handler.

import { serviceClient, supabaseStore, userIdFromRequest } from '../_shared/db.ts';
import { env, productionSafeFetch, txtLookup } from '../_shared/deno.ts';
import { consoleLogger } from '../_shared/log.ts';
import { verifyOwnership } from '../_shared/verify.ts';
import { verifySiteHandler } from './handler.ts';

const client = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const fetch = productionSafeFetch();

Deno.serve(
  verifySiteHandler({
    store: supabaseStore(client),
    userIdFromRequest: (req) => userIdFromRequest(client, req),
    verifyOwnership: (site) => verifyOwnership(site, { fetch, lookupTxt: txtLookup }),
    allowedOrigin: env('SITE_ORIGIN'),
    log: consoleLogger,
  }),
);
