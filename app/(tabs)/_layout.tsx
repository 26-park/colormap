import { Tabs } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { theme } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        // ⚠️ tabBarStyle에 height를 주지 말 것 — 높이를 직접 지정하면
        // getTabBarHeight가 그 값을 그대로 쓰고 하단 인셋을 더하지 않아
        // (@react-navigation/bottom-tabs) 제스처 바에 탭바가 먹힌다.
        // 배경/테두리만 지정하고 높이·패딩 계산은 라이브러리에 맡긴다.
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        // 탭바는 높이가 고정이라(49dp + 하단 인셋) 시스템 글꼴 배율이 그대로
        // 곱해지면 "지도" → "지…"로 잘린다(갤럭시 보고, font_scale 1.5로 재현).
        // 라벨은 아이콘과 함께 뜻을 전달하므로 여기서는 확대를 끈다.
        // ⚠️ 커스텀 라벨 컴포넌트로 maxFontSizeMultiplier를 주는 방식은 쓰지 말 것 —
        //    tabBarLabel이 함수면 라이브러리가 labelBeneath 스타일을 입히지 않아
        //    폭이 좁아지고 오히려 더 잘린다(실측).
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: theme.fonts.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '지도',
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="map.fill" size={size} color={color} />
          ),
        }}
      />
      {/* 탐색 탭은 v1.1 자리 — v1은 지도/프로필 2탭만 노출 */}
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="person.fill" size={size} color={color} />
          ),
        }}
      />
      {/* compose 탭은 탭바에서 제거 — 나라 상세에서 진입 예정 */}
      <Tabs.Screen
        name="compose"
        options={{ href: null }}
      />
    </Tabs>
  );
}
