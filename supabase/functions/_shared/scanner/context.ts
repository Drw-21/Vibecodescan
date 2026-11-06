// Turns a collected snapshot into the ScanContext every check receives.

import type { CollectResult } from './collect.ts';
import { detect } from './detect.ts';
import type { SafeFetch, ScanContext } from './types.ts';

export function buildContext(
  collected: CollectResult,
  options: { verified: boolean; fetch: SafeFetch },
): ScanContext {
  const { platform, backend } = detect(collected);
  return { ...collected, platform, backend, verified: options.verified, fetch: options.fetch };
}
