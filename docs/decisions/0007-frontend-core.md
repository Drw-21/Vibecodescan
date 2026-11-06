# 0007 — Frontend core (milestone 5)

**Context.** Milestone 5 builds the first screens: Landing, Scan in progress and Report, for the
free scan, in light and dark mode, on phone and desktop.

**Decisions.**

- **One package.** `web/` shares the root `package.json`, lockfile, lint, format and `npm audit`
  with the rest of the repo, and has its own `tsconfig.json` (DOM + JSX).
- **No router yet.** Three screens are a small state machine in `App.tsx`. A router arrives with
  accounts and the dashboard (milestone 6), when screens need their own URLs.
- **The browser validates what the server sends** (Zod in `lib/api.ts`) and renders every string
  as text. No `dangerouslySetInnerHTML` anywhere; a unit test and the browser test both feed a
  hostile `<img onerror>` title and check it shows as plain text.
- **Free report** shows exactly what the Free plan allows: grade, score, a plain summary sentence,
  counts by severity (icon + word + colour), and the top 3 titles. The landing page's sample report
  uses the full-report layout (findings grouped by severity, expandable, "Copy fix prompt") with
  our own example data, so that layout is built and tested before milestone 7 fills it.
- **The progress checklist** ticks on a timer while the single create-scan request runs, never
  marks the last step done until the scan really is, and does not animate with reduced motion.
- **Design tokens** live in `styles/tokens.css` and are exposed to Tailwind. A test checks WCAG AA
  contrast (4.5:1) for every text/background pair in both themes, and 3:1 for the focus ring.
- **Our own security headers** are in `web/public/_headers` (Cloudflare Pages): strict CSP with no
  inline scripts, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy. Turnstile is the only
  third-party script and frame allowed.
- **Browser test** (`web/e2e/free-scan.ts`, `npm run e2e`, in CI) builds the site and drives
  Chromium through a whole free scan at 375 px and 1280 px, light and dark, keyboard only, checking
  for sideways scrolling and tap targets under 44 px. The scanner API and Turnstile are stand-ins.

**Consequences.** Signed-in scans (202 + watching the row) are handled by the server already; the
screens for them come with accounts in milestone 6.
