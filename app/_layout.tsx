// app/_layout.tsx
import { handleAuthDeepLink, parseAuthDeepLink } from '@/lib/deepLinks';
import { supabase } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const skipNextSignedInRedirect = useRef(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsSignedIn(!!data.session?.user);
    };
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsSignedIn(!!session?.user);
      if (event === 'SIGNED_IN' && session?.user) {
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else {
          router.replace('/(tabs)');
        }
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
