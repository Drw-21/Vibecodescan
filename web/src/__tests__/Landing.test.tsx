import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURES, PLANS, PROBLEM, SOLUTION } from '../lib/landingContent';
import { Landing } from '../pages/Landing';

afterEach(cleanup);

const renderLanding = () => render(<Landing />);

/** Verbs a button or call-to-action link may start with. */
const VERBS = [
  'Scan',
  'Start',
  'Get',
  'Copy',
  'Show',
  'Hide',
  'Find',
  'See',
  'Check',
  'Verify',
  'Sign',
  'Add',
  'Join',
];

describe('landing page', () => {
  it('has the sections in the required order', () => {
    const { container } = renderLanding();
    // Top-level sections only (the sample report inside the solution is its own section).
    const top = [...(container.firstElementChild?.children ?? [])].filter(
      (e) => e.tagName === 'SECTION',
    );
    const ids = top.map((s) => s.id || s.getAttribute('aria-labelledby'));
    expect(ids).toEqual(['top', 'problem', 'how', 'checks', 'pricing', 'faq', 'cta-title']);
  });

  it('gives every button and call-to-action link a label that starts with a verb', () => {
    const { container } = renderLanding();
    const labelled = [
      ...screen.getAllByRole('button').map((b) => b.textContent),
      ...[...container.querySelectorAll('a[data-cta]')].map((a) => a.textContent),
    ].map((t) => t.trim());
    expect(labelled.length).toBeGreaterThan(5);
    for (const label of labelled) {
      expect(VERBS, label).toContain(label.split(/[\s:]/)[0]);
    }
  });

  it('shows no placeholder text, stats or testimonials until real ones exist', () => {
    const { container } = renderLanding();
    expect(container.textContent).not.toMatch(/\[[^\]]*\]/);
    expect(container.querySelector('blockquote')).toBeNull();
  });

  it('sends every "start a scan" link to the scan page', () => {
    const { container } = renderLanding();
    const scanLinks = [...container.querySelectorAll('a[data-cta]')].filter((a) =>
      /^(Scan|Start)/.test(a.textContent.trim()),
    );
    expect(scanLinks.length).toBeGreaterThanOrEqual(3);
    for (const a of scanLinks) expect(a.getAttribute('href')).toBe('/scan');
  });

  it('shows every plan, but paid plans cannot be bought until billing exists', () => {
    renderLanding();
    for (const plan of PLANS) expect(screen.getByRole('heading', { name: plan.name })).toBeTruthy();
    for (const plan of PLANS.filter((p) => !p.available)) {
      expect(screen.getByRole('button', { name: plan.cta }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('keeps the problem to 3 one-line bullets and the solution to 3 before-and-after pairs', () => {
    expect(PROBLEM.bullets).toHaveLength(3);
    for (const b of PROBLEM.bullets) expect(b.length).toBeLessThanOrEqual(70);
    expect(SOLUTION.pairs).toHaveLength(3);
  });

  it('gives every feature card a name of 3 words or fewer and one sentence', () => {
    expect(FEATURES).toHaveLength(6);
    for (const f of FEATURES) {
      expect(f.title.split(' ').length, f.title).toBeLessThanOrEqual(3);
      expect(f.text.match(/[.!?](\s|$)/g)?.length ?? 0, f.text).toBe(1);
    }
  });
});
