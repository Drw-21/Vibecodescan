import { useEffect, useRef, useState } from 'react';
import { ScanProgress } from './components/ScanProgress';
import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { type FreeSummary, createScan } from './lib/api';
import { type PublicEnv, readEnv } from './lib/env';
import { Landing } from './pages/Landing';
import { FreeReport } from './pages/Report';

type Screen =
  | { name: 'landing'; error: string | null }
  | { name: 'scanning'; host: string; finished: boolean }
  | { name: 'report'; host: string; summary: FreeSummary };

/** How long the finished checklist stays visible before the report appears. */
const FINISH_PAUSE_MS = 600;

export function App({ env = readEnv(), fetchImpl }: { env?: PublicEnv; fetchImpl?: typeof fetch }) {
  const [screen, setScreen] = useState<Screen>({ name: 'landing', error: null });
  const [lastUrl, setLastUrl] = useState('');
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // On every screen change: back to the top, and move keyboard and screen-reader focus to the
  // new screen's heading so the change is announced. Not on the very first load.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    main.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [screen.name]);

  async function scan(url: string, token: string) {
    const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? url;
    setLastUrl(url);
    setScreen({ name: 'scanning', host, finished: false });
    const outcome = await createScan(env, url, token, fetchImpl);
    if (outcome.kind === 'error') {
      setScreen({ name: 'landing', error: outcome.message });
      return;
    }
    setScreen({ name: 'scanning', host, finished: true });
    await new Promise((r) => setTimeout(r, FINISH_PAUSE_MS));
    setScreen({ name: 'report', host, summary: outcome.summary });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <SiteHeader showNav={screen.name === 'landing'} />
      <main ref={main} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
        {screen.name === 'landing' && (
          <Landing
            siteKey={env.turnstileSiteKey}
            error={screen.error}
            initialUrl={lastUrl}
            onScan={(url, token) => {
              void scan(url, token);
            }}
          />
        )}
        {screen.name === 'scanning' && (
          <ScanProgress host={screen.host} finished={screen.finished} />
        )}
        {screen.name === 'report' && (
          <FreeReport
            host={screen.host}
            summary={screen.summary}
            onScanAgain={() => {
              setLastUrl('');
              setScreen({ name: 'landing', error: null });
            }}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
