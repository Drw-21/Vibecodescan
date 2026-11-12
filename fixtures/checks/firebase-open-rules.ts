// Deep check fixtures: fake Firebase Realtime Database and Firestore REST endpoints.

import { fake } from '../secrets.ts';
import { appSite } from '../sites.ts';
import type { FakeRoute } from '../site.ts';
import type { CheckCase } from './types.ts';

const PROJECT = 'ref-app-123';
const RTDB = `https://${PROJECT}-default-rtdb.firebaseio.com/.json?shallow=true`;
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const json = (body: unknown, status = 200): FakeRoute => ({
  status,
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});
const firestoreDenied = json(
  {
    error: {
      code: 403,
      message: 'Missing or insufficient permissions.',
      status: 'PERMISSION_DENIED',
    },
  },
  403,
);

const withFirebase = (routes: Record<string, FakeRoute>) =>
  appSite({
    bundles: {
      '/assets/index-a1b2c3d4.js': `initializeApp({apiKey:"${fake.firebaseApiKey()}",authDomain:"${PROJECT}.firebaseapp.com",projectId:"${PROJECT}"});`,
    },
    routes,
  });

export const cases: CheckCase[] = [
  {
    name: 'a Firestore collection can be read without signing in',
    site: withFirebase({
      [`${FIRESTORE}/users?pageSize=1`]: json({
        documents: [
          {
            name: 'projects/x/documents/users/1',
            fields: { email: { stringValue: 'someone@example.test' } },
          },
        ],
      }),
    }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['Firestore', 'users'],
    mustNotLeak: ['someone@example.test'],
  },
  {
    name: 'the Realtime Database can be read without signing in',
    site: withFirebase({ [RTDB]: json({ users: true, messages: true }) }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['Realtime Database'],
  },
  {
    name: 'everything refuses a visitor who is not signed in',
    site: withFirebase({
      [RTDB]: json({ error: 'Permission denied' }, 401),
      [`${FIRESTORE}/users?pageSize=1`]: firestoreDenied,
      [`${FIRESTORE}/profiles?pageSize=1`]: firestoreDenied,
    }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: an empty database or an empty collection is not open data',
    site: withFirebase({
      [RTDB]: json(null),
      [`${FIRESTORE}/users?pageSize=1`]: json({}),
    }),
    expect: 'pass',
  },
  {
    name: 'fail safe: no Firebase database could be found to test',
    site: withFirebase({}),
    expect: 'incomplete',
  },
  {
    name: 'fail safe: an unexpected refusal is not proof the data is protected',
    site: withFirebase({
      'https://firestore.googleapis.com/*': json(
        { error: { code: 400, status: 'INVALID_ARGUMENT' } },
        400,
      ),
      [`https://${PROJECT}-default-rtdb.firebaseio.com/*`]: json({ error: 'bad' }, 400),
    }),
    expect: 'incomplete',
  },
  {
    name: 'the app does not use Firebase',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'fail safe: Firebase answers 503 everywhere',
    site: withFirebase({
      'https://firestore.googleapis.com/*': json({}, 503),
      [`https://${PROJECT}-default-rtdb.firebaseio.com/*`]: json({}, 503),
    }),
    expect: 'incomplete',
  },
];
