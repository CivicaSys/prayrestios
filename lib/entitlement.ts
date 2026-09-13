// lib/entitlement.ts
import Purchases from 'react-native-purchases';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

export interface EntitlementProvider {
  hasActiveEntitlement(): Promise<boolean>;
}

/**
 * Wraps the one boolean check the rest of the app needs from RevenueCat.
 * Fails open: a RevenueCat/network error is logged and treated as
 * "entitled" rather than locking out someone who may have already paid.
 */
export class RevenueCatEntitlementProvider implements EntitlementProvider {
  async hasActiveEntitlement(): Promise<boolean> {
    try {
      const info = await Purchases.getCustomerInfo();
      return PREMIUM_ENTITLEMENT_ID in info.entitlements.active;
    } catch (err) {
      console.error('Entitlement check failed, failing open:', err);
      return true;
    }
  }
}
