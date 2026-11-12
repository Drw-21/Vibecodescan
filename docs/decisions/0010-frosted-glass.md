# 0010 — Frosted glass surfaces and the Geist typeface

**Context.** The owner asked for frosted-glass design elements (translucent, blurred panels like
modern iOS/macOS widgets). Glass only reads as glass when something colourful sits behind it, and
the spec's design rules say "no decorative gradients".

**Decision.** A deliberate, owner-approved deviation from "no decorative gradients":

- Three large, very soft colour glows (indigo family; navy and teal in dark mode) are painted
  behind the page, fixed so glass surfaces blur them as you scroll. Abstract shapes, no photos
  (no licences, no extra weight on phones).
- Cards, tiles, panels and the call-to-action band use a `glass` surface: translucent tint,
  background blur with extra saturation, a thin light edge and a soft top highlight. The header
  and footer use a stronger `glass-bar`; the header is sticky.
- Readability first: the glass tint is opaque enough that body text, secondary text, the accent
  and the low-severity colour keep WCAG AA (4.5:1) over every combination of glows, in both themes.
  A test computes those combinations and fails if the tint gets too transparent.
- Fallbacks: "reduce transparency" (system setting) and browsers without background blur get
  solid surfaces and no glows. Input fields stay solid so typing is always crisp.

- **Typeface** (owner's request for a more modern font): Geist for all text and Geist Mono for
  evidence and fix prompts (both SIL OFL), replacing the spec's system font stack. The font files
  are bundled into our own site (`@fontsource-variable/*`), so the CSP's `font-src 'self'` holds
  and no visitor data goes to a font service; browsers download only the alphabets a page needs.
  System fonts remain the fallback.

**Consequences.** Background blur costs some GPU time on low-end phones; glass is limited to
cards and bars (no blur on large scrolling areas). Severity colours remain for severity only.

**Update (0.6.4).** Two pages instead of one: the landing page at `/` and the free scan at
`/scan` (owner's request). Routing reads the path once on load; links are ordinary links, so no
router library is needed (KISS) and Cloudflare's single-page fallback already serves `/scan`.
Calls to action are pill-shaped; a deep-ink colour (`--contrast-bg`, contrast-tested) is used for
primary buttons and a few emphasis panels, alongside the indigo accent.
