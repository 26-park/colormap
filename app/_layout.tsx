import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';
import { theme } from '@/constants/theme';

// 루트 레벨 렌더 에러 바운더리 — expo-router가 이 파일의 default export(RootLayout,
// AuthProvider 포함 전체 트리)를 감싼다. retry()는 error state를 지워 전체 트리를
// 그대로 리마운트시킨다(같은 위치에서 엘리먼트 타입이 바뀌면 React가 언마운트 후
// 재마운트 — expo-router의 Try 컴포넌트 동작 확인함). fetch 실패 같은 비동기 에러는
// 여기서 못 잡는다(렌더 단계 동기 에러만) — 그건 화면별 error state로 별도 처리.
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={errorStyles.root}>
      <Text style={errorStyles.title}>문제가 발생했어요</Text>
      <Text style={errorStyles.subtitle}>불편을 드려 죄송해요. 다시 시도해주세요.</Text>
      <Pressable style={errorStyles.retryBtn} onPress={() => retry()}>
        <Text style={errorStyles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.accent,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

// auth 상태가 확정될 때까지 스플래시 화면 유지
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, hasProfile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Pretendard 정적 OTF 5종 — weight별 fontFamily로 등록(theme.ts의 fonts와
  // 이름을 맞춤). 로드가 auth 확정과 같은 스플래시 게이트에 합류한다.
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  });

  useEffect(() => {
    // fontError가 있으면 fail-open — 폰트 로드 실패로 스플래시에 영영 갇히면
    // 안 되니, 이 경우엔 fontsLoaded를 기다리지 않고 진행한다(AppText가
    // 참조하는 fontFamily가 없으면 RN이 시스템 폰트로 조용히 폴백한다).
    if (loading || (!fontsLoaded && !fontError)) return;
    if (fontError) console.error('Pretendard 폰트 로드 실패:', fontError);

    // auth + 폰트(또는 폰트 실패 확정) 후 스플래시 해제 후 올바른 화면으로 이동
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
  }, [session, hasProfile, loading, fontsLoaded, fontError]);

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
