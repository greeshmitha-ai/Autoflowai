/**
 * AuthContext — provides user session and RBAC helpers.
 * Enforces same role-based feature visibility as web Dashboard (Task 34.3).
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';
import {
  getStoredToken,
  setStoredToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredTokens,
} from '../lib/storage';

interface User {
  userId: string;
  tenantId: string;
  roles: string[];
  email: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  canSendMessages: boolean;
  canUpdateRecords: boolean;
  canViewCRM: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await getStoredToken();
        if (token) {
          const me = await authApi.me();
          setUser(me as User);
        }
      } catch {
        await clearStoredTokens();
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const { accessToken, refreshToken } = await authApi.login(email, password);
    await setStoredToken(accessToken);
    await setStoredRefreshToken(refreshToken);
    const me = await authApi.me();
    setUser(me as User);
  };

  const logout = async () => {
    await clearStoredTokens();
    setUser(null);
  };

  const hasRole = (role: string) => user?.roles.includes(role) ?? false;

  // RBAC-derived capabilities matching web Dashboard permissions
  const canSendMessages = hasRole('owner') || hasRole('admin') || hasRole('member');
  const canUpdateRecords = hasRole('owner') || hasRole('admin') || hasRole('member');
  const canViewCRM = hasRole('owner') || hasRole('admin') || hasRole('member');

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, hasRole, canSendMessages, canUpdateRecords, canViewCRM }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
