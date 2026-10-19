import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Tokens } from './types';

/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL (e.g. http://100.x.y.z:3000 for the homelab over
 * Tailscale). Without it, development builds assume the API runs on the same machine as Metro.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:3000`;
}

export const API_URL = resolveBaseUrl();

/** An API refusal with the French message the backend wrote for the user. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

interface Session {
  getTokens(): Tokens | null;
  setTokens(t: Tokens | null): void;
}

let session: Session | null = null;
let refreshing: Promise<boolean> | null = null;

export function bindSession(s: Session) {
  session = s;
}

async function refreshTokens(): Promise<boolean> {
  const tokens = session?.getTokens();
  if (!tokens) return false;
  // One refresh at a time: concurrent 401s wait for the same rotation.
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        session?.setTokens(null);
        return false;
      }
      const next = (await res.json()) as Tokens;
      session?.setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const tokens = session?.getTokens();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Pas de connexion. Vérifiez internet et réessayez.');
  }

  if (res.status === 401 && tokens && !retried && !path.startsWith('/auth/')) {
    if (await refreshTokens()) return api<T>(path, init, true);
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : 'Une erreur est survenue. Réessayez.';
    throw new ApiError(res.status, data?.code, message);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.';
}
