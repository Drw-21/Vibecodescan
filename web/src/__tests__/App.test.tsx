import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';

const env = {
  supabaseUrl: 'https://proj.supabase.test',
  supabaseAnonKey: 'anon',
  turnstileSiteKey: 'site-key',
};
const SUMMARY = {
  scanId: 's1',
  status: 'done',
  grade: 'D',
  score: 52,
  partial: false,
  counts: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
  topIssues: ['Your OpenAI API key is visible to anyone', '<b>not bold</b>'],
};

beforeEach(() => {
  // A stand-in Turnstile that passes at once.
  window.turnstile = {
    render: (_el, options) => {
      options.callback('test-token');
      return 'widget-1';
    },
    remove: () => undefined,
  };
  window.scrollTo = () => undefined;
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
});

function respond(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(Response.json(body, { status }));
}

describe('free scan flow', () => {
  it('asks for an address before scanning', async () => {
    render(<App env={env} fetchImpl={respond(200, SUMMARY)} />);
    await screen.findByRole('button', { name: 'Scan my app' });
    fireEvent.click(screen.getByRole('button', { name: 'Scan my app' }));
    expect(screen.getByText('Please enter your app’s address.')).toBeTruthy();
  });

  it('goes from the address to the progress checklist to the report', async () => {
    render(<App env={env} fetchImpl={respond(200, SUMMARY)} />);
    fireEvent.change(screen.getByLabelText('Your app’s address'), {
      target: { value: 'https://myapp.lovable.app/' },
    });
    await new Promise((r) => setTimeout(r, 0)); // let the human check finish
    fireEvent.click(screen.getByRole('button', { name: 'Scan my app' }));
    expect(await screen.findByRole('heading', { name: 'Scanning your app' })).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'myapp.lovable.app' }, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Grade D');
    expect(screen.getByText('Your OpenAI API key is visible to anyone')).toBeTruthy();
    // Scanned text is shown literally.
    expect(screen.getByText('<b>not bold</b>')).toBeTruthy();
    expect(document.querySelector('main b')).toBeNull();
  });

  it('shows the server’s message and lets the founder try again', async () => {
    render(
      <App
        env={env}
        fetchImpl={respond(429, {
          error: 'daily_limit',
          message: 'You have used your 3 free scans for today.',
        })}
      />,
    );
    fireEvent.change(screen.getByLabelText('Your app’s address'), {
      target: { value: 'myapp.lovable.app' },
    });
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Scan my app' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'You have used your 3 free scans for today.',
    );
    expect(screen.getByRole('button', { name: 'Scan my app' })).toBeTruthy();
  });
});
