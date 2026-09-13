// app/_layout.tsx
import { profileAtom, type Profile } from '@/lib/atoms';
import { handleAuthDeepLink, parseAuthDeepLink } from '@/lib/deepLinks';
import { RevenueCatEntitlementProvider } from '@/lib/entitlement';
import { PAYWALL_ENABLED } from '@/lib/featureFlags';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { configurePurchasesIfEnabled, linkPurchasesIdentity } from '@/lib/purchases';
import { supabase } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSetAtom } from 'jotai';
import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import 'react-native-reanimated';

const entitlementProvider = new RevenueCatEntitlementProvider();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState<boolean | null>(null);
  const setProfile = useSetAtom(profileAtom);
  const skipNextSignedInRedirect = useRef(false);
  const inPasswordRecovery = useRef(false);

  // Must run before the session-check effect below: Purchases.configure() has to
  // complete before any getCustomerInfo()/hasActiveEntitlement() call, or the SDK
  // call fails open (silently granting access). React fires effects in declaration
  // order, so this effect must stay declared first.
  useEffect(() => {
    configurePurchasesIfEnabled();
  }, []);

  const loadProfile = async (userId: string): Promise<void> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, preferred_translation')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Failed to load profile:', error);
      return;
    }
    if (data) {
      setProfile({
        id: data.id,
        displayName: data.display_name,
        preferredTranslation: data.preferred_translation,
      } satisfies Profile);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const signedIn = !!data.session?.user;
      setIsSignedIn(signedIn);
      if (signedIn) {
        await loadProfile(data.session!.user.id);
        setHasEntitlement(PAYWALL_ENABLED ? await entitlementProvider.hasActiveEntitlement() : true);
      } else {
        setHasEntitlement(true);
      }
    };
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsSignedIn(!!session?.user);

      if (event === 'SIGNED_IN' && session?.user) {
        await linkPurchasesIdentity(session.user.id);
        await loadProfile(session.user.id);
        const entitled = PAYWALL_ENABLED ? await entitlementProvider.hasActiveEntitlement() : true;
        setHasEntitlement(entitled);
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else if (entitled) {
          const onboarded = await hasCompletedOnboarding(session.user.id);
          router.replace(onboarded ? '/(tabs)' : '/onboarding');
        }
        // else: not entitled -- leave navigation to the isSignedIn/hasEntitlement
        // effect below, which redirects to the resubscribe paywall. Firing both
        // this replace() and that effect's replace() for the same event would
        // race (briefly showing tabs/onboarding before the paywall redirect wins).
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setHasEntitlement(true);
        router.replace('/');
      }
    });

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const { type } = parseAuthDeepLink(url);
      if (type === 'recovery') {
        skipNextSignedInRedirect.current = true;
        inPasswordRecovery.current = true;
      }
      const isRecovery = await handleAuthDeepLink(url);
      if (isRecovery) {
        router.replace('/reset-password');
        inPasswordRecovery.current = false;
      } else if (type === 'recovery') {
        skipNextSignedInRedirect.current = false;
        inPasswordRecovery.current = false;
        Alert.alert('Link expired', 'This password reset link is no longer valid. Please request a new one.');
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const urlSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      listener?.subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  useEffect(() => {
    if (isSignedIn && hasEntitlement === false && !inPasswordRecovery.current) {
      router.replace('/paywall?context=resubscribe');
    }
  }, [isSignedIn, hasEntitlement]);

  if (!loaded || isSignedIn === null || hasEntitlement === null) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
            <Stack.Screen name="quiz-goals" />
            <Stack.Screen name="quiz-source" />
            <Stack.Screen name="quiz-commitment" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
