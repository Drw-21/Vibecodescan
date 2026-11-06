// Talks to the create-scan Edge Function. Every response is validated before use
// (spec: "Validate at the edges"), and every string is later rendered as plain text.

import { z } from 'zod';
import type { PublicEnv } from './env';

const Counts = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
  info: z.number().int().min(0),
});

const FreeSummary = z.object({
  scanId: z.string().min(1).max(64),
  status: z.literal('done'),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  score: z.number().int().min(0).max(100),
  partial: z.boolean(),
  counts: Counts,
  topIssues: z.array(z.string().max(200)).max(3),
});
export type FreeSummary = z.infer<typeof FreeSummary>;

const Failure = z.object({ error: z.string().max(64), message: z.string().max(300) });

export type ScanOutcome =
  { kind: 'done'; summary: FreeSummary } | { kind: 'error'; code: string; message: string };

const NETWORK_MESSAGE = 'We could not reach our scanner. Check your connection and try again.';
const TIMEOUT_MESSAGE = 'The scan took too long to answer. Please try again in a few minutes.';

/** The server stops a scan at 55 seconds; give up a little after that. */
export const REQUEST_TIMEOUT_MS = 90_000;

export async function createScan(
  env: PublicEnv,
  url: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScanOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${env.supabaseUrl}/functions/v1/create-scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify({ url, turnstileToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { kind: 'error', code: 'timeout', message: TIMEOUT_MESSAGE };
    }
    return { kind: 'error', code: 'network', message: NETWORK_MESSAGE };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'error', code: 'bad_response', message: NETWORK_MESSAGE };
  }

  const done = FreeSummary.safeParse(body);
  if (res.ok && done.success) return { kind: 'done', summary: done.data };
  const failed = Failure.safeParse(body);
  if (failed.success)
    return { kind: 'error', code: failed.data.error, message: failed.data.message };
  return { kind: 'error', code: 'bad_response', message: NETWORK_MESSAGE };
}
