import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';

// auth 상태가 확정될 때까지 스플래시 화면 유지
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, hasProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // auth 확정 → 스플래시 해제 후 올바른 화면으로 이동
    SplashScreen.hideAsync();

    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login' as any);
    } else if (!hasProfile) {
      if (!inOnboarding) router.replace('/(onboarding)/username' as any);
    } else {
      if (inAuth || inOnboarding) router.replace('/(tabs)');
    }
  }, [session, hasProfile, loading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
