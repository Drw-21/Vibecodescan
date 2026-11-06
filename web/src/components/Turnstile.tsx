import { useEffect, useRef } from 'react';

// Cloudflare Turnstile ("I am human" check) for the anonymous scan form.

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      'timeout-callback': () => void;
    },
  ): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => {
      resolve();
    });
    script.addEventListener('error', () => {
      reject(new Error('turnstile failed to load'));
    });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function Turnstile({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** The check could not load or run: the visitor must be told, not left stuck. */
  onError: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return;
        if (!window.turnstile) throw new Error('turnstile missing');
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (token) => {
            onToken(token);
          },
          'expired-callback': () => {
            onToken(null);
          },
          'error-callback': () => {
            onToken(null);
            onError();
          },
          'timeout-callback': () => {
            onToken(null);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        onToken(null);
        onError();
      });
    return () => {
      cancelled = true;
      if (id !== undefined) window.turnstile?.remove(id);
    };
  }, [siteKey, onToken, onError]);
  return <div ref={box} className="min-h-[65px]" />;
}
