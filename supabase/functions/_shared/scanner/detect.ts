// Works out which AI builder made the app and which backend it talks to, so fix prompts
// can be tailored and deep checks know what to test. Pure: reads the collected snapshot only.

import { JWT_TOKEN, jwtPayload } from './jwt.ts';
import type { Backend, Bundle, Platform } from './types.ts';

export interface DetectInput {
  url: URL;
  html: string;
  headers: Headers;
  bundles: Bundle[];
}

interface PlatformRule {
  platform: Platform;
  hosts?: string[];
  html?: RegExp;
  header?: (h: Headers) => boolean;
}

// Builders first, then the hosts they deploy to.
const PLATFORM_RULES: PlatformRule[] = [
  {
    platform: 'lovable',
    hosts: ['.lovable.app', '.lovableproject.com'],
    html: /content=["']Lovable["']|gptengineer|lovable-tagger/i,
  },
  { platform: 'bolt', hosts: ['.bolt.host'], html: /bolt\.new/i },
  { platform: 'replit', hosts: ['.replit.app', '.repl.co', '.replit.dev'] },
  { platform: 'v0', html: /content=["']v0\.(?:app|dev)["']/i },
  {
    platform: 'vercel',
    hosts: ['.vercel.app'],
    header: (h) => h.has('x-vercel-id') || /vercel/i.test(h.get('server') ?? ''),
  },
  {
    platform: 'netlify',
    hosts: ['.netlify.app'],
    header: (h) => h.has('x-nf-request-id') || /netlify/i.test(h.get('server') ?? ''),
  },
];

const SUPABASE_URL = /https:\/\/([a-z0-9]{20})\.supabase\.co/;
const SUPABASE_PUBLISHABLE = /(?<![A-Za-z0-9_-])sb_publishable_[A-Za-z0-9_-]{20,}/;
const FIREBASE_PROJECT = /projectId["']?\s*:\s*["']([a-z0-9-]{4,40})["']/;
const FIREBASE_DATABASE =
  /databaseURL["']?\s*:\s*["'](https:\/\/[a-z0-9-]{4,63}\.(?:firebaseio\.com|[a-z0-9-]{2,30}\.firebasedatabase\.app))\/?["']/;

export function detect(input: DetectInput): { platform: Platform; backend: Backend } {
  return { platform: detectPlatform(input), backend: detectBackend(input) };
}

function detectPlatform(input: DetectInput): Platform {
  const host = input.url.hostname;
  for (const rule of PLATFORM_RULES) {
    if (rule.hosts?.some((suffix) => host.endsWith(suffix))) return rule.platform;
    if (rule.html?.test(input.html)) return rule.platform;
    if (rule.header?.(input.headers)) return rule.platform;
  }
  return 'unknown';
}

function detectBackend(input: DetectInput): Backend {
  const texts = [input.html, ...input.bundles.map((b) => b.body)];
  const backend: Backend = {};

  for (const text of texts) {
    const url = SUPABASE_URL.exec(text);
    if (!url) continue;
    const ref = url[1];
    const anonKey = findAnonKey(text, ref) ?? texts.map((t) => findAnonKey(t, ref)).find(Boolean);
    if (anonKey) {
      backend.supabase = { url: url[0], anonKey };
      break;
    }
  }

  for (const text of texts) {
    const project = FIREBASE_PROJECT.exec(text);
    if (project?.[1] && /firebaseapp\.com|firebaseio\.com|AIza/.test(text)) {
      const databaseUrl = FIREBASE_DATABASE.exec(text)?.[1];
      backend.firebase = databaseUrl
        ? { projectId: project[1], databaseUrl }
        : { projectId: project[1] };
      break;
    }
  }
  return backend;
}

/** The PUBLIC key only: a JWT whose role is "anon", or a publishable key. Never service_role. */
function findAnonKey(text: string, ref: string | undefined): string | undefined {
  for (const match of text.matchAll(JWT_TOKEN)) {
    const payload = jwtPayload(match[0]);
    if (payload?.['role'] === 'anon' && (payload['ref'] === undefined || payload['ref'] === ref)) {
      return match[0];
    }
  }
  return SUPABASE_PUBLISHABLE.exec(text)?.[0];
}
