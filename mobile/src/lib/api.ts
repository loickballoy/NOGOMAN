import Constants from 'expo-constants';
import { File } from 'expo-file-system';
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

/** Seconds until the access token expires, or null if it can't be read. */
export function tokenSecondsLeft(token: string, now = Date.now()): number | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(globalThis.atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return typeof payload.exp === 'number' ? payload.exp - now / 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Refreshes an access token that is about to expire. Uploads need this: when the server
 * rejects them early (expired token) it doesn't read the body, and iOS then reports a
 * dropped connection instead of the 401, so the usual refresh-on-401 never runs.
 */
async function ensureFreshToken() {
  const tokens = session?.getTokens();
  if (!tokens) return;
  const left = tokenSecondsLeft(tokens.accessToken);
  if (left !== null && left < 60) await refreshTokens();
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  if (!path.startsWith('/auth/')) await ensureFreshToken();
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
    // In development, say which address failed: it is almost always the wrong IP or port.
    const where = __DEV__ ? ` (API injoignable : ${API_URL})` : '';
    throw new ApiError(0, 'NETWORK', `Pas de connexion. Vérifiez internet et réessayez.${where}`);
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

/** A valid access token, for media the app loads directly (voice notes). */
export async function accessToken(): Promise<string | undefined> {
  await ensureFreshToken();
  return session?.getTokens()?.accessToken;
}

/**
 * Uploads a voice note as the raw audio bytes (Content-Type: audio/...), with the other fields
 * in the query string. No FormData: Expo's fetch rejects React Native-style file parts
 * ("Unsupported FormDataPart implementation"), while a plain byte body always works.
 * `file.uri` is a local file on phones and a blob: URL on web.
 */
export async function apiUpload<T>(path: string, fields: Record<string, string>, file: { uri: string; name: string; type: string }, retried = false): Promise<T> {
  await ensureFreshToken();
  let body: Uint8Array | Blob;
  try {
    if (Platform.OS === 'web') {
      body = await (await fetch(file.uri)).blob();
    } else {
      const uri = /^[a-z]+:\/\//i.test(file.uri) ? file.uri : `file://${file.uri}`;
      body = await new File(uri).bytes();
    }
  } catch (err) {
    console.warn(`[upload] could not read ${file.uri}: ${String(err)}`);
    throw new ApiError(0, 'FILE', 'Le message vocal n’a pas pu être lu. Réessayez.');
  }
  const tokens = session?.getTokens();
  const query = new URLSearchParams(fields).toString();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': file.type,
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      body: body as BodyInit,
    });
  } catch (err) {
    // Shows up in the Metro terminal during development.
    console.warn(`[upload] ${path} failed: ${String(err)} (file ${file.uri})`);
    // A dropped upload is often an early rejection (see ensureFreshToken): refresh and retry once.
    if (!retried && tokens && (await refreshTokens())) return apiUpload<T>(path, fields, file, true);
    const detail = __DEV__ ? ` (${String(err)})` : '';
    throw new ApiError(0, 'NETWORK', `Pas de connexion. Le message vocal n’est pas parti.${detail}`);
  }
  if (res.status === 401 && tokens && !retried && (await refreshTokens())) return apiUpload<T>(path, fields, file, true);
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, data?.code, typeof data?.message === 'string' ? data.message : 'Envoi impossible.');
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.';
}
