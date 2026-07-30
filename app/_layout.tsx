import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';
import { Text } from '@/components/AppText';
import { ErrorView } from '@/components/ErrorView';
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
    fontFamily: theme.fonts.bold,
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
    fontFamily: theme.fonts.bold,
    color: '#fff',
  },
});

const profileErrorStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: theme.colors.background,
  },
});

// auth 상태가 확정될 때까지 스플래시 화면 유지
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, profileStatus, loading, refreshProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // 프로필 판정 실패(profileStatus === 'error') 시 재시도 중임을 보여주기 위한 로컬 상태.
  // 재시도 동안 status는 'error'로 유지되므로(auth context가 'checking'으로 되돌리지
  // 않음) 아래 에러 화면이 그대로 머문다 — 스택이 잠깐 보였다 사라지는 깜빡임 없음.
  const [retryingProfile, setRetryingProfile] = useState(false);
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
    } else if (profileStatus === 'error') {
      // 판정 불가 — 어디로도 보내지 않는다. 특히 온보딩으로 보내면 안 된다
      // (프로필이 있는데 조회만 실패한 경우가 여기로 온다). 아래에서 재시도 UI를 렌더.
      return;
    } else if (profileStatus === 'none') {
      if (!inOnboarding) router.replace('/(onboarding)/username' as any);
    } else {
      if (inAuth || inOnboarding) router.replace('/(tabs)');
    }
  }, [session, profileStatus, loading, fontsLoaded, fontError]);

  async function handleRetryProfile() {
    setRetryingProfile(true);
    await refreshProfile();
    setRetryingProfile(false);
  }

  // 세션은 있는데 프로필 판정이 불가능한 상태 — 온보딩으로 튀지 않게 여기서 붙잡는다.
  // 스플래시는 위 useEffect에서 이미 내렸으므로 갇히지도 않는다(fail-open).
  if (session && profileStatus === 'error') {
    return (
      <View style={profileErrorStyles.root}>
        {retryingProfile ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <ErrorView message="프로필을 확인하지 못했어요" onRetry={handleRetryProfile} />
        )}
        <StatusBar style="auto" />
      </View>
    );
  }

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
