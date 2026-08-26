import { Tabs } from 'expo-router';
import { Text } from '@/components/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { theme } from '@/constants/theme';

// 탭 라벨은 시스템 글꼴 크기를 따라 커지되 상한을 둔다.
// 탭바 높이는 고정(49dp + 하단 인셋)이라 배율이 그대로 곱해지면 글자가 세로로
// 잘리고 "지도" → "지…"처럼 말줄임이 된다 — 갤럭시에서 실제로 보고된 증상이고
// 에뮬레이터 font_scale 1.5로 동일하게 재현했다.
// 라벨은 아이콘과 함께 뜻을 전달하므로 상한을 둬도 정보가 사라지지 않는다.
const TAB_LABEL_MAX_SCALE = 1.2;

function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
      style={{ fontSize: 11, fontFamily: theme.fonts.medium, color }}
    >
      {label}
    </Text>
  );
}

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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '지도',
          tabBarLabel: ({ color }) => <TabLabel label="지도" color={color} />,
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
          tabBarLabel: ({ color }) => <TabLabel label="프로필" color={color} />,
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
