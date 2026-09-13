// lib/purchases.ts
import Purchases from 'react-native-purchases';
import { PAYWALL_ENABLED } from './featureFlags';

let configured = false;

export function configurePurchasesIfEnabled(): void {
  if (!PAYWALL_ENABLED || configured) return;
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    console.error('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not set; skipping Purchases.configure');
    return;
  }
  Purchases.configure({ apiKey });
  configured = true;
}

export async function linkPurchasesIdentity(userId: string): Promise<void> {
  if (!PAYWALL_ENABLED) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.error('Purchases.logIn failed, continuing without blocking signup:', err);
  }
}
