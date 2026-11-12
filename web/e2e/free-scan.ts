// Milestone 5 "done when": a free scan works end to end on phone and desktop, light and dark.
// Builds the site, serves it, and drives a real browser. The scanner API and the Turnstile
// widget are stand-ins (no real network). Screenshots go to SCREENSHOT_DIR if set.
//
//   npm run e2e                       # checks only
//   SCREENSHOT_DIR=/tmp/shots npm run e2e

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://localhost:${String(PORT)}`;
// Must match the CSP's connect-src (https://*.supabase.co); requests are intercepted below.
const SUPABASE = 'https://e2e-project.supabase.co';
const shots = process.env['SCREENSHOT_DIR'];

const SUMMARY = {
  scanId: '00000000-0000-4000-8000-000000000001',
  status: 'done',
  grade: 'D',
  score: 52,
  partial: false,
  counts: { critical: 1, high: 0, medium: 2, low: 3, info: 0 },
  topIssues: [
    'Your OpenAI API key is visible to anyone',
    'No protection against injected scripts (Content-Security-Policy)',
    '<img src=x onerror="document.title=\'hacked\'">',
  ],
};

/** The Content-Security-Policy from web/public/_headers, applied as production would. */
const CSP =
  /Content-Security-Policy: (.*)/.exec(
    readFileSync(join('web', 'public', '_headers'), 'utf8'),
  )?.[1] ?? '';

const FAKE_TURNSTILE = `window.turnstile = { render(el, o) { setTimeout(() => o.callback('e2e-token'), 50); return 'w'; }, remove() {} };`;

const VITE = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');

/** Runs Vite directly with Node (not through npx), so kill() really stops it. */
function vite(args: string[], env: Record<string, string> = {}) {
  return spawn(process.execPath, [VITE, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

async function waitFor(url: string, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${url}`);
}

async function check(page: Page, label: string) {
  // Mobile first: nothing wider than the screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error(`${label}: page scrolls sideways by ${String(overflow)}px`);
  // 44 × 44 px minimum tap targets for every visible button and field.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, input')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        text: `${el.getAttribute('name') ?? ''} ${el.textContent}`.trim().slice(0, 40),
        h: el.getBoundingClientRect().height,
      }))
      .filter((b) => b.h < 44),
  );
  if (small.length > 0)
    throw new Error(`${label}: tap targets under 44px: ${JSON.stringify(small)}`);
  if (shots) await page.screenshot({ path: join(shots, `${label}.png`), fullPage: true });
}

async function main() {
  const build = vite(['build', '--config', 'web/vite.config.ts', '--logLevel', 'warn'], {
    VITE_SUPABASE_URL: SUPABASE,
    VITE_SUPABASE_ANON_KEY: 'anon-key-for-e2e',
    VITE_TURNSTILE_SITE_KEY: 'e2e-site-key',
  });
  const code = await new Promise<number | null>((r) => build.on('exit', r));
  if (code !== 0) throw new Error('build failed');

  const server = vite([
    'preview',
    '--config',
    'web/vite.config.ts',
    '--port',
    String(PORT),
    '--strictPort',
  ]);
  if (shots) mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  try {
    await waitFor(BASE);
    const combos = [
      { name: 'phone', viewport: { width: 375, height: 812 } },
      { name: 'desktop', viewport: { width: 1280, height: 900 } },
    ] as const;
    for (const device of combos) {
      for (const scheme of ['light', 'dark'] as const) {
        const label = `${device.name}-${scheme}`;
        const context = await browser.newContext({
          viewport: device.viewport,
          colorScheme: scheme,
          deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        const seen = { dialog: false, cspViolations: [] as string[] };
        page.on('console', (m) => {
          if (/Content Security Policy|Refused to/i.test(m.text()))
            seen.cspViolations.push(m.text());
        });
        page.on('pageerror', (e) => {
          seen.cspViolations.push(`page error: ${e.message}`);
        });
        // Serve our pages with the production security headers (vite preview does not read _headers).
        await page.route(`${BASE}/**`, async (r) => {
          const res = await r.fetch();
          await r.fulfill({
            response: res,
            headers: { ...res.headers(), 'content-security-policy': CSP },
          });
        });
        page.on('dialog', (d) => {
          seen.dialog = true;
          void d.dismiss();
        });
        await page.route('https://challenges.cloudflare.com/**', (r) =>
          r.fulfill({ contentType: 'text/javascript', body: FAKE_TURNSTILE }),
        );
        await page.route(`${SUPABASE}/functions/v1/create-scan`, async (r) => {
          const body = r.request().postDataJSON() as { url: string; turnstileToken: string };
          if (body.url === 'localhost') {
            return r.fulfill({
              status: 400,
              json: {
                error: 'invalid_url',
                message: 'That does not look like a public website address.',
              },
            });
          }
          if (body.turnstileToken !== 'e2e-token')
            return r.fulfill({
              status: 403,
              json: { error: 'captcha_failed', message: 'captcha' },
            });
          await new Promise((res) => setTimeout(res, 2500));
          return r.fulfill({ json: SUMMARY });
        });

        await page.goto(BASE);
        await page.getByRole('heading', { name: 'Is the app you built with AI safe?' }).waitFor();
        // Expand a sample finding so the screenshot shows the full-report layout.
        await page.getByRole('button', { name: /OpenAI API key/ }).click();
        await check(page, `${label}-1-landing`);

        // The landing page has no form: its button opens the scan page.
        await page.getByRole('link', { name: 'Scan my app free' }).click();
        await page.waitForURL(`${BASE}/scan`);
        await page.getByRole('heading', { name: 'Scan your app' }).waitFor();
        await check(page, `${label}-1-scan-page`);

        // Keyboard only: focus the field, type, press Enter.
        await page.getByLabel('Your app’s address').focus();
        await page.keyboard.type('myapp.lovable.app');
        await page.waitForTimeout(150); // the stand-in human check
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Scanning your app' }).waitFor();
        await check(page, `${label}-2-scanning`);

        await page.getByRole('heading', { name: 'myapp.lovable.app' }).waitFor({ timeout: 10_000 });
        await page.getByText('Top issues').waitFor();
        await check(page, `${label}-3-report`);

        if (
          seen.dialog ||
          (await page.title()) === 'hacked' ||
          (await page.locator('main img').count()) > 0
        ) {
          throw new Error(`${label}: scanned text was treated as HTML`);
        }
        // Back to the start, then the error path: the message shows and the address stays.
        await page.getByRole('button', { name: 'Scan another app' }).click();
        await page.getByRole('heading', { name: 'Scan your app' }).waitFor();
        await page.getByLabel('Your app’s address').fill('localhost');
        await page.waitForTimeout(150);
        await page.getByRole('button', { name: 'Scan my app' }).click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'public website address' })
          .waitFor({ timeout: 10_000 });
        if ((await page.getByLabel('Your app’s address').inputValue()) !== 'localhost') {
          throw new Error(`${label}: the address was lost after an error`);
        }
        await check(page, `${label}-4-error`);

        if (seen.cspViolations.length > 0) {
          throw new Error(
            `${label}: Content-Security-Policy violations: ${seen.cspViolations.join(' | ')}`,
          );
        }
        console.log(`ok  ${label}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().then(
  () => {
    console.log('e2e: free scan works on phone and desktop, light and dark');
    process.exit(0);
  },
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
