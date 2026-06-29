import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';

function RootLayoutNav() {
  const { session, hasProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';

    if (!session) {
      // 비로그인 → 로그인 화면
      if (!inAuth) router.replace('/(auth)/login' as any);
    } else if (!hasProfile) {
      // 로그인됐지만 프로필 없음 → username 온보딩
      if (!inOnboarding) router.replace('/(onboarding)/username' as any);
    } else {
      // 로그인 + 프로필 있음 → 앱 본체
      if (inAuth || inOnboarding) router.replace('/(tabs)');
    }
  }, [session, hasProfile, loading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true, title: 'Modal' }} />
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
