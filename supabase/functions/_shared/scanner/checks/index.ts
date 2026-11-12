// Every check the engine knows. To add a check: drop its file in this folder, add it here,
// and switch it on in config.ts (CHECK_MODES). The runner never changes.

import type { Check } from '../types.ts';
import { cookieFlags } from './cookie-flags.ts';
import { exposedFiles } from './exposed-files.ts';
import { firebaseOpenRules } from './firebase-open-rules.ts';
import { https } from './https.ts';
import { platformDetect } from './platform-detect.ts';
import { secretInBundle } from './secret-in-bundle.ts';
import { securityHeaders } from './security-headers.ts';
import { sourceMaps } from './source-maps.ts';
import { supabasePublicTables } from './supabase-public-tables.ts';

export const ALL_CHECKS: readonly Check[] = [
  secretInBundle,
  exposedFiles,
  sourceMaps,
  securityHeaders,
  https,
  cookieFlags,
  platformDetect,
  // Deep checks: run only on verified sites (requiresVerification).
  supabasePublicTables,
  firebaseOpenRules,
];
