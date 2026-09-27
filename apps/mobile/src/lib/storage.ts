/**
 * Secure token storage using expo-secure-store (or AsyncStorage fallback).
 */
import { Platform } from 'react-native';

const TOKEN_KEY = 'platform_access_token';
const REFRESH_KEY = 'platform_refresh_token';

// Lazy import to avoid issues in environments without native modules
async function getSecureStore() {
  if (Platform.OS === 'web') return null;
  try {
    const SecureStore = await import('expo-secure-store');
    return SecureStore;
  } catch {
    return null;
  }
}

export async function getStoredToken(): Promise<string | null> {
  const store = await getSecureStore();
  if (store) return store.getItemAsync(TOKEN_KEY);
  return null;
}

export async function setStoredToken(token: string): Promise<void> {
  const store = await getSecureStore();
  if (store) await store.setItemAsync(TOKEN_KEY, token);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const store = await getSecureStore();
  if (store) return store.getItemAsync(REFRESH_KEY);
  return null;
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  const store = await getSecureStore();
  if (store) await store.setItemAsync(REFRESH_KEY, token);
}

export async function clearStoredTokens(): Promise<void> {
  const store = await getSecureStore();
  if (store) {
    await store.deleteItemAsync(TOKEN_KEY);
    await store.deleteItemAsync(REFRESH_KEY);
  }
}
