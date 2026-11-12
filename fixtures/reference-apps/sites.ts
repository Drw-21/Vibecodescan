// Simulated reference apps for the integration suite. Each one is the clean app with
// exactly the flaw(s) listed for it in expected-results.json. The live reference apps
// (spec: "Validation of the scanner") are built and hosted separately; these simulations
// let CI check the whole engine against the same written expectations on every push.

import { fake, supabaseUrl } from '../secrets.ts';
import { GOOD_HEADERS, appSite, type AppOptions } from '../sites.ts';
import type { Site } from '../site.ts';

const LOVABLE = '<meta name="author" content="Lovable" />';
const BOLT = '<meta name="generator" content="bolt.new" />';
const V0 = '<meta name="generator" content="v0.app" />';

const supabaseClient = (): string =>
  `const supabase=createClient("${supabaseUrl()}","${fake.supabaseAnon()}");`;
const firebaseClient = (): string =>
  `initializeApp({apiKey:"${fake.firebaseApiKey()}",authDomain:"ref-app-123.firebaseapp.com",projectId:"ref-app-123"});`;

const bundle = (code: string): Record<string, string> => ({ '/assets/index-a1b2c3d4.js': code });

const app = (id: string, options: AppOptions): Site =>
  appSite({ host: `${id}.example.test`, ...options });

const NO_HEADERS = { 'content-type': 'text/html' };

/** The profiles table answers a logged-out visitor with a row: RLS is off. */
const OPEN_PROFILES = {
  [`${supabaseUrl()}/rest/v1/profiles?select=*&limit=1`]: {
    body: JSON.stringify([{ id: 1, email: 'someone@example.test' }]),
    headers: { 'content-type': 'application/json' },
  },
};

/** Firestore lets anyone read the users collection. */
const OPEN_FIRESTORE = {
  'https://firestore.googleapis.com/v1/projects/ref-app-123/databases/(default)/documents/users?pageSize=1':
    {
      body: JSON.stringify({ documents: [{ name: 'users/1', fields: {} }] }),
      headers: { 'content-type': 'application/json' },
    },
};

export const REFERENCE_SITES: Record<string, Site> = {
  'ref-clean': app('ref-clean', { head: LOVABLE, bundles: bundle(supabaseClient()) }),
  'ref-exposed-key': app('ref-exposed-key', {
    head: LOVABLE,
    bundles: bundle(`${supabaseClient()}const openai=new OpenAI({apiKey:"${fake.openai()}"});`),
  }),
  'ref-public-keys-only': app('ref-public-keys-only', {
    head: BOLT,
    bundles: bundle(
      `${supabaseClient()}const stripe=Stripe("${fake.stripePublishable()}");${firebaseClient()}`,
    ),
  }),
  'ref-open-table': app('ref-open-table', {
    head: LOVABLE,
    bundles: bundle(supabaseClient()),
    routes: OPEN_PROFILES,
  }),
  'ref-open-table-unverified': app('ref-open-table-unverified', {
    head: LOVABLE,
    bundles: bundle(supabaseClient()),
    routes: OPEN_PROFILES,
  }),
  'ref-firebase-open': app('ref-firebase-open', {
    head: BOLT,
    bundles: bundle(firebaseClient()),
    routes: OPEN_FIRESTORE,
  }),
  'ref-exposed-env': appSite({
    host: 'ref-exposed-env.replit.app',
    bundles: bundle(supabaseClient()),
    routes: {
      '/.env': {
        body: `VITE_SUPABASE_URL=${supabaseUrl()}\nSTRIPE_SECRET_KEY=${fake.stripeLive()}\n`,
        headers: { 'content-type': 'text/plain' },
      },
    },
  }),
  'ref-catch-all-spa': app('ref-catch-all-spa', {
    head: LOVABLE,
    bundles: bundle(supabaseClient()),
    catchAll: true,
  }),
  'ref-source-maps': app('ref-source-maps', {
    head: V0,
    bundles: bundle(`${supabaseClient()}\n//# sourceMappingURL=index-a1b2c3d4.js.map`),
    routes: {
      '/assets/index-a1b2c3d4.js.map': {
        body: JSON.stringify({ version: 3, sources: ['../src/App.tsx'], mappings: 'AAAA' }),
        headers: { 'content-type': 'application/json' },
      },
    },
  }),
  'ref-no-headers': app('ref-no-headers', {
    bundles: bundle(supabaseClient()),
    headers: { ...NO_HEADERS, server: 'Netlify' },
  }),
  'ref-no-https-redirect': app('ref-no-https-redirect', {
    bundles: bundle('export const app=1;'),
    httpRedirect: false,
  }),
  'ref-insecure-cookies': appSite({
    host: 'ref-insecure-cookies.replit.app',
    bundles: bundle(supabaseClient()),
    headers: [...Object.entries(GOOD_HEADERS), ['set-cookie', 'session=abc123; Path=/']],
  }),
  'ref-insecure-lovable': app('ref-insecure-lovable', {
    head: LOVABLE,
    bundles: bundle(`${supabaseClient()}const openai=new OpenAI({apiKey:"${fake.openai()}"});`),
    headers: NO_HEADERS,
    routes: OPEN_PROFILES,
  }),
};
