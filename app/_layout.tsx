// app/_layout.tsx
import { profileAtom, type Profile } from '@/lib/atoms';
import { handleAuthDeepLink, parseAuthDeepLink } from '@/lib/deepLinks';
import { hasCompletedOnboarding } from '@/lib/onboarding';
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

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const setProfile = useSetAtom(profileAtom);
  const skipNextSignedInRedirect = useRef(false);

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
      if (signedIn) await loadProfile(data.session!.user.id);
    };
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsSignedIn(!!session?.user);

      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user.id);
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else {
          const onboarded = await hasCompletedOnboarding(session.user.id);
          router.replace(onboarded ? '/(tabs)' : '/onboarding');
        }
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        router.replace('/');
      }
    });

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const { type } = parseAuthDeepLink(url);
      if (type === 'recovery') {
        skipNextSignedInRedirect.current = true;
      }
      const isRecovery = await handleAuthDeepLink(url);
      if (isRecovery) {
        router.replace('/reset-password');
      } else if (type === 'recovery') {
        skipNextSignedInRedirect.current = false;
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

  if (!loaded || isSignedIn === null) {
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
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
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
