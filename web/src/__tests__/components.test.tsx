import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindingRow } from '../components/FindingRow';
import { GradeRing } from '../components/GradeRing';
import { SeverityBadge } from '../components/SeverityBadge';

afterEach(cleanup);

describe('SeverityBadge', () => {
  it('always shows a word and an icon, never colour alone', () => {
    render(<SeverityBadge severity="critical" count={2} />);
    expect(screen.getByText('2 Critical')).toBeTruthy();
    expect(screen.getByText('⛔')).toBeTruthy();
  });
});

describe('GradeRing', () => {
  it('describes the grade for screen readers', () => {
    render(<GradeRing grade="D" score={52} partial />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Grade D, At risk. Score 52 out of 100, partial.',
    );
  });
});

describe('FindingRow', () => {
  const finding = {
    severity: 'critical' as const,
    title: 'Your OpenAI API key is visible to anyone',
    explanation: 'Anyone can copy it.',
    evidence: 'sk-p…9xQ2 in /assets/a.js',
    fixPrompt: 'Move the key to a server function. After the fix, rescan to confirm.',
  };

  it('expands to show the explanation, evidence and fix prompt', () => {
    render(<FindingRow finding={finding} />);
    const toggle = screen.getByRole('button', { name: /OpenAI/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Anyone can copy it.').closest('[hidden]')).not.toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Anyone can copy it.').closest('[hidden]')).toBeNull();
    expect(screen.getByText('sk-p…9xQ2 in /assets/a.js')).toBeTruthy();
  });

  it('copies the fix prompt', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<FindingRow finding={finding} />);
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy fix prompt' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(finding.fixPrompt);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('renders scanned text as text, never as HTML (stored XSS)', () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    const { container } = render(
      <FindingRow finding={{ ...finding, title: evil, evidence: evil, explanation: evil }} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
  });
});
