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
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
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
