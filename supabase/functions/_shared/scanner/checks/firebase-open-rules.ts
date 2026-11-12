// firebase-open-rules (deep, verified sites only): can someone who is NOT signed in read the
// app's Firebase data? One read-only GET to the Realtime Database root (shallow, keys only),
// and one read-only GET per common Firestore collection (pageSize=1). Nothing that comes back
// is kept: only where the data was readable.

import { safeEvidence } from '../redact.ts';
import type { Check, Finding, SafeResponse } from '../types.ts';

export const COMMON_COLLECTIONS = ['users', 'profiles', 'messages', 'posts', 'orders'];
const MAX_BYTES = 16 * 1024;

type Answer = 'open' | 'closed' | 'absent' | 'unknown';

export const firebaseOpenRules: Check = {
  id: 'firebase-open-rules',
  title: 'Firebase data anyone can read',
  requiresVerification: true,
  timeoutMs: 8_000,
  async run(ctx) {
    const firebase = ctx.backend.firebase;
    if (!firebase) {
      return [
        {
          checkId: this.id,
          status: 'pass',
          severity: 'critical',
          title: 'Your app does not use a Firebase database we could find',
          explanation:
            'This check looks for Firebase data that anyone can read. We found no Firebase project in your app.',
          fixKey: this.id,
        },
      ];
    }
    const id = firebase.projectId;
    const rtdbBase = firebase.databaseUrl ?? `https://${id}-default-rtdb.firebaseio.com`;
    const probes: { label: string; url: string; classify: (r: SafeResponse) => Answer }[] = [
      {
        label: 'Realtime Database',
        url: `${rtdbBase}/.json?shallow=true`,
        classify: realtimeDatabase,
      },
      ...COMMON_COLLECTIONS.map((c) => ({
        label: `Firestore collection “${c}”`,
        url: `https://firestore.googleapis.com/v1/projects/${id}/databases/(default)/documents/${c}?pageSize=1`,
        classify: firestore,
      })),
    ];

    const answers = await Promise.all(
      probes.map(async (p): Promise<Answer> => {
        try {
          return p.classify(await ctx.fetch(p.url, { maxBytes: MAX_BYTES }));
        } catch {
          return 'unknown';
        }
      }),
    );

    const findings: Finding[] = [];
    probes.forEach((p, i) => {
      if (answers[i] !== 'open') return;
      findings.push({
        checkId: this.id,
        status: 'fail',
        severity: 'critical',
        title: `Anyone can read your ${p.label} without signing in`,
        explanation:
          'Your Firebase security rules let people who are not signed in read this data, so anyone can download it. Change the rules so only signed-in users can read their own data, then publish them.',
        evidenceRedacted: safeEvidence(`${p.label}: readable while logged out`),
        fixKey: this.id,
      });
    });
    if (findings.length > 0) return findings;

    // Fail safe: no clear answer, or no database found to test, is not a pass.
    if (answers.includes('unknown') || !answers.includes('closed')) {
      return [
        {
          checkId: this.id,
          status: 'incomplete',
          severity: 'critical',
          title: 'We could not finish checking your Firebase data',
          explanation: answers.includes('unknown')
            ? 'Some of our read-only requests to Firebase did not get a clear answer, so we cannot say whether your data is protected. Rescan to try again.'
            : 'We could not find your Firebase databases to test, so we cannot say whether your data is protected.',
          fixKey: this.id,
        },
      ];
    }
    return [
      {
        checkId: this.id,
        status: 'pass',
        severity: 'critical',
        title: 'Your Firebase data refused a visitor who was not signed in',
        explanation:
          'We tried to read your Realtime Database and common Firestore collections while logged out, and got no data.',
        fixKey: this.id,
      },
    ];
  },
};

function serverTrouble(res: SafeResponse): boolean {
  return res.status === 429 || res.status >= 500;
}

function realtimeDatabase(res: SafeResponse): Answer {
  if (serverTrouble(res)) return 'unknown';
  if (res.status === 404) return 'absent';
  if (res.status === 401 && /permission denied/i.test(res.body)) return 'closed';
  if (res.status !== 200) return 'unknown';
  return res.body.trim() === 'null' ? 'closed' : 'open';
}

function firestore(res: SafeResponse): Answer {
  if (serverTrouble(res)) return 'unknown';
  if (res.status === 404) return 'absent';
  if (res.status === 403 && /PERMISSION_DENIED/.test(res.body)) return 'closed';
  if (res.status !== 200) return 'unknown';
  if (/"documents"\s*:\s*\[\s*\{/.test(res.body)) return 'open';
  return /^\s*\{\s*\}\s*$/.test(res.body) ? 'closed' : 'unknown';
}
