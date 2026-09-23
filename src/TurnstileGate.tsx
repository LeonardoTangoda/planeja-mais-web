import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

let loader: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-planeja-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile indisponível')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.planejaTurnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile indisponível'));
    document.head.appendChild(script);
  });

  return loader;
}

export function TurnstileGate({
  action,
  onToken,
}: {
  action: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileEnabled || !container.current) return;
    let active = true;

    loadTurnstile()
      .then(() => {
        if (!active || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: action.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32),
          theme: 'auto',
          appearance: 'interaction-only',
          size: 'flexible',
          retry: 'auto',
          'refresh-expired': 'auto',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'timeout-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            return true;
          },
        });
      })
      .catch(() => onToken(null));

    return () => {
      active = false;
      if (widgetId.current && window.turnstile?.remove) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      onToken(null);
    };
  }, [action, onToken]);

  if (!turnstileEnabled) return null;
  return <div className="turnstile-shell" ref={container} />;
}
