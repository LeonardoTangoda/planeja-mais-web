export const PASSWORD_MIN_LENGTH = 10;

function characterGroups(value: string) {
  return [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;
}

export function passwordMeetsPolicy(value: string) {
  if (value.length < PASSWORD_MIN_LENGTH) return false;
  if (new Set(value).size < 4) return false;
  const lower = value.toLowerCase();
  const obvious = ['0123456789', '1234567890', 'abcdefghij', 'qwertyuiop'];
  if (obvious.some((pattern) => lower.includes(pattern))) return false;
  return value.length >= 14 || characterGroups(value) >= 2;
}

export const PASSWORD_POLICY_MESSAGE =
  'Use pelo menos 10 caracteres. Misture letras com números ou símbolos, ou use uma frase longa.';

const rangeCache = new Map<string, string>();

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function fetchHashRange(prefix: string) {
  const cached = rangeCache.get(prefix);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.text();
    rangeCache.set(prefix, body);
    return body;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function compromisedPasswordCount(password: string): Promise<number | null> {
  if (!globalThis.crypto?.subtle) return null;
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const body = await fetchHashRange(prefix);
  if (body === null) return null;

  for (const line of body.split(/\r?\n/)) {
    const [candidate, rawCount] = line.trim().split(':');
    if (candidate === suffix) return Number(rawCount || 0);
  }
  return 0;
}

export async function assertSafeNewPassword(password: string) {
  if (!passwordMeetsPolicy(password)) throw new Error(PASSWORD_POLICY_MESSAGE);
  const breachedCount = await compromisedPasswordCount(password);
  if (breachedCount !== null && breachedCount > 0) {
    throw new Error(
      'Essa senha já apareceu em vazamentos conhecidos. Escolha outra senha que você não use em outros serviços.',
    );
  }
  return { breachCheck: breachedCount === null ? 'unavailable' : 'clear' as const };
}
