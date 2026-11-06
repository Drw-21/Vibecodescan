// platform-detect: reports which builder and backend we recognised, so the report and the
// fix prompts can be tailored. Information only; never fails.

import type { Backend, Check, Platform } from '../types.ts';

const PLATFORM_NAMES: Record<Platform, string> = {
  lovable: 'Lovable',
  bolt: 'Bolt',
  replit: 'Replit',
  v0: 'v0',
  vercel: 'Vercel',
  netlify: 'Netlify',
  unknown: '',
};

function describe(platform: Platform, backend: Backend): string {
  const parts: string[] = [];
  if (platform !== 'unknown') parts.push(`built with ${PLATFORM_NAMES[platform]}`);
  if (backend.supabase) parts.push('uses Supabase');
  if (backend.firebase) parts.push('uses Firebase');
  if (parts.length === 0) return 'We could not tell which tool built your app';
  const text = parts.join(', ');
  return `Your app is ${text}`;
}

export const platformDetect: Check = {
  id: 'platform-detect',
  title: 'What your app is built with',
  requiresVerification: false,
  timeoutMs: 8_000,
  run(ctx) {
    return Promise.resolve([
      {
        checkId: this.id,
        status: 'pass',
        severity: 'info',
        title: describe(ctx.platform, ctx.backend),
        explanation:
          'Knowing how your app was built lets us write fix instructions you can paste straight into your AI builder.',
        fixKey: `platform-detect.${ctx.platform}`,
      },
    ]);
  },
};
