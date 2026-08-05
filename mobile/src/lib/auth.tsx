import * as React from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
type User = {
  id: string;
  email: string;
  displayName: string;
  plan: string;
  creditsRemaining: number;
  isAdmin?: boolean;
};
type AuthContextValue = {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};
const TOKEN_KEY = 'synthwave_token';
const AuthContext = React.createContext<AuthContextValue | null>(null);
async function saveToken(value: string | null) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      if (value) window.localStorage.setItem(TOKEN_KEY, value);
      else window.localStorage.removeItem(TOKEN_KEY);
    }
    return;
  }
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
async function loadToken() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      const saved = await loadToken();
      if (saved) {
        setToken(saved);
        try {
          const me = await api<User>('/v1/auth/me', {}, saved);
          setUser(me);
        } catch {
          await saveToken(null);
          setToken(null);
        }
      }
      setReady(true);
    })();
  }, []);
  const refreshMe = React.useCallback(async () => {
    if (!token) return;
    const me = await api<User>('/v1/auth/me', {}, token);
    setUser(me);
  }, [token]);
  const login = React.useCallback(async (email: string, password: string) => {
    const result = await api<{ accessToken: string; user: User }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveToken(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);
  const register = React.useCallback(async (displayName: string, email: string, password: string) => {
    const result = await api<{ accessToken: string; user: User }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email, password }),
    });
    await saveToken(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);
  const logout = React.useCallback(async () => {
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, []);
  return <AuthContext.Provider value={{ token, user, ready, login, register, logout, refreshMe }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
