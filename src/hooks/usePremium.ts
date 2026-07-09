import { useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import { useAnchorStore } from '@/store/anchorStore';

const REVENUECAT_API_KEY_IOS = 'appl_hWIxjQKdZKWJEghUYxzgHbBRhiN';
const REVENUECAT_API_KEY_ANDROID = 'goog_DPtfSkuMEnvcxBnVhsFFeGItCcK';
const REVENUECAT_API_KEY = Platform.OS === 'android' ? REVENUECAT_API_KEY_ANDROID : REVENUECAT_API_KEY_IOS;
const ENTITLEMENT_ID = 'premium';

const FORCE_PREMIUM = false;

let initialised = false;

export async function initialisePurchases() {
  if (initialised) return;
  initialised = true;
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: REVENUECAT_API_KEY });

  // Keep premium status in sync with any entitlement change — including
  // offer-code redemptions made through the native redemption sheet, which
  // otherwise wouldn't update the UI until the next app launch.
  Purchases.addCustomerInfoUpdateListener((info) => {
    if (FORCE_PREMIUM) return;
    const active = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useAnchorStore.getState().setIsPremium(active);
  });
}

export async function checkPremiumStatus(): Promise<boolean> {
  if (FORCE_PREMIUM) return true;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

export async function purchasePremium(pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    if (active) {
      useAnchorStore.getState().setIsPremium(true);
    }
    return { success: active };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false };
    return { success: false, error: e?.message ?? 'Purchase failed. Please try again.' };
  }
}

export async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
  try {
    const info = await Purchases.restorePurchases();
    const active = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    useAnchorStore.getState().setIsPremium(active);
    return { success: active };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Restore failed. Please try again.' };
  }
}

// Hook — call once from root layout to initialise and sync premium status
export function usePremiumInit() {
  useEffect(() => {
    (async () => {
      await initialisePurchases();
      const isPremium = await checkPremiumStatus();
      useAnchorStore.getState().setIsPremium(isPremium);
    })();

    // Re-check on every foreground. Catches offer-code redemptions made
    // through the native sheet or the App Store, where the entitlement may
    // land after the app has resigned active and the update listener alone
    // isn't guaranteed to fire.
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        const active = await checkPremiumStatus();
        useAnchorStore.getState().setIsPremium(active);
      }
    });
    return () => sub.remove();
  }, []);
}
