import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, bindSession } from './api';
import { storage } from './storage';
import { SelfUser, Tokens } from './types';

const KEY = 'nogoman.session';

interface AuthState {
  ready: boolean;
  user: SelfUser | null;
  signIn(tokens: Tokens, user: SelfUser): Promise<void>;
  signOut(): Promise<void>;
  setUser(user: SelfUser): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const tokensRef = useRef<Tokens | null>(null);
  const [user, setUser] = useState<SelfUser | null>(null);
  const [ready, setReady] = useState(false);

  const persist = useCallback((t: Tokens | null) => {
    tokensRef.current = t;
    if (t) storage.set(KEY, JSON.stringify(t));
    else {
      storage.remove(KEY);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  useEffect(() => {
    bindSession({ getTokens: () => tokensRef.current, setTokens: persist });
    (async () => {
      const raw = await storage.get(KEY);
      if (raw) {
        try {
          tokensRef.current = JSON.parse(raw);
          setUser(await api<SelfUser>('/me'));
        } catch {
          persist(null);
        }
      }
      setReady(true);
    })();
  }, [persist]);

  const value = useMemo<AuthState>(() => ({
    ready,
    user,
    async signIn(tokens, me) {
      persist(tokens);
      setUser(me);
    },
    async signOut() {
      const t = tokensRef.current;
      if (t) api('/auth/logout', { method: 'POST', body: { refreshToken: t.refreshToken } }).catch(() => {});
      persist(null);
    },
    setUser,
  }), [ready, user, persist]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** For screens that only render once signed in. */
export function useMe(): SelfUser {
  const { user } = useAuth();
  if (!user) throw new Error('useMe without a signed-in user');
  return user;
}
