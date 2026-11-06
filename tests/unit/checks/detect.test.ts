import { describe, expect, it } from 'vitest';
import { detect } from '../../../supabase/functions/_shared/scanner/detect.ts';
import { SUPABASE_REF, fake, supabaseUrl } from '../../../fixtures/secrets.ts';

const page = (html = '', headers: Record<string, string> = {}, host = 'app.example.test') => ({
  url: new URL(`https://${host}/`),
  html,
  headers: new Headers(headers),
  bundles: [] as { url: string; body: string }[],
});

describe('detect: platform', () => {
  it.each([
    ['lovable', page('', {}, 'my-app.lovable.app')],
    ['lovable', page('<meta name="author" content="Lovable" />')],
    ['bolt', page('<meta name="generator" content="bolt.new" />')],
    ['replit', page('', {}, 'my-app.replit.app')],
    ['v0', page('<meta name="generator" content="v0.app" />')],
    ['vercel', page('', { 'x-vercel-id': 'iad1::abc' })],
    ['netlify', page('', { server: 'Netlify' })],
    ['unknown', page('<html></html>')],
  ])('detects %s', (platform, input) => {
    expect(detect(input).platform).toBe(platform);
  });

  it('prefers the builder over the host it is deployed on', () => {
    expect(
      detect(page('<meta name="author" content="Lovable" />', { server: 'Netlify' })).platform,
    ).toBe('lovable');
  });
});

describe('detect: backend', () => {
  it('finds the Supabase project URL and its public anon key', () => {
    const anon = fake.supabaseAnon();
    const input = page();
    input.bundles.push({
      url: 'https://app.example.test/assets/a.js',
      body: `createClient("${supabaseUrl()}","${anon}")`,
    });
    expect(detect(input).backend.supabase).toEqual({ url: supabaseUrl(), anonKey: anon });
  });

  it('never treats a service_role key as the anon key', () => {
    const input = page();
    input.bundles.push({
      url: 'https://app.example.test/assets/a.js',
      body: `createClient("${supabaseUrl()}","${fake.supabaseServiceRole()}")`,
    });
    expect(detect(input).backend.supabase).toBeUndefined();
  });

  it('accepts the newer publishable key', () => {
    const key = fake.supabasePublishable();
    const input = page();
    input.bundles.push({
      url: 'https://app.example.test/assets/a.js',
      body: `createClient("https://${SUPABASE_REF}.supabase.co","${key}")`,
    });
    expect(detect(input).backend.supabase?.anonKey).toBe(key);
  });

  it('finds the Firebase project id', () => {
    const input = page();
    input.bundles.push({
      url: 'https://app.example.test/assets/a.js',
      body: `initializeApp({apiKey:"${fake.firebaseApiKey()}",authDomain:"my-app-123.firebaseapp.com",projectId:"my-app-123"})`,
    });
    expect(detect(input).backend.firebase).toEqual({ projectId: 'my-app-123' });
  });

  it('finds nothing in an app with no backend', () => {
    expect(detect(page()).backend).toEqual({});
  });
});
