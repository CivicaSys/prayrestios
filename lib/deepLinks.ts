// lib/deepLinks.ts
import { supabase } from '@/lib/supabase';

export interface ParsedAuthLink {
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export function parseAuthDeepLink(url: string): ParsedAuthLink {
  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  return {
    type: params.get('type'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  };
}

export async function handleAuthDeepLink(url: string): Promise<boolean> {
  const { type, accessToken, refreshToken } = parseAuthDeepLink(url);
  if (type !== 'recovery' || !accessToken || !refreshToken) {
    return false;
  }
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return true;
}
