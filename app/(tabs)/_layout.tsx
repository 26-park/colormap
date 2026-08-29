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
        // ⭐ 라벨을 아예 두지 않는다 — 아이콘만.
        // "지도" → "지…", "프로필" → "프로…" 잘림을 두 번 고쳤지만(글꼴 배율
        // 상한 → tabBarAllowFontScaling: false) 실기기에서 계속 재발했다.
        // 원인은 배율이 아니라 Pretendard 텍스트의 측정 폭이 실제보다 좁게
        // 잡히는 것이고, 라벨은 numberOfLines: 1 로 렌더돼(@react-navigation/
        // elements Label.js) 폭이 모자라면 말줄임이 된다.
        // 글자를 없애면 이 문제 자체가 성립하지 않는다. 탭이 2개뿐이고
        // 아이콘(지도·사람)이 뜻을 분명히 전달한다.
        tabBarShowLabel: false,
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
