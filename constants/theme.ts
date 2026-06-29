// 디자인 시스템 토큰 — docs/PRD.md 6장
// accent(#ff6a2b)는 앱 테마색. 도시·나라에 칠하는 색(country_visits.color)과 무관.
export const theme = {
  colors: {
    accent: '#ff6a2b',
    background: '#ffffff',
    text: '#1a1a1a',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    placeholder: '#9ca3af',
    error: '#dc2626',
  },
  radius: {
    input: 12,
    button: 14,
    card: 16,
  },
  // TODO: Pretendard 폰트 로드 후 여기에 fontFamily 추가
} as const;

// 기존 컴포넌트 호환용 — 추후 Pretendard 적용 시 교체
import { Platform } from 'react-native';
export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// react-navigation 컬러 스킴 호환 (탭바 등에서 사용)
export const Colors = {
  light: {
    text: '#1a1a1a',
    background: '#ffffff',
    tint: '#ff6a2b',
    icon: '#6b7280',
    tabIconDefault: '#6b7280',
    tabIconSelected: '#ff6a2b',
  },
  dark: {
    text: '#f9fafb',
    background: '#111827',
    tint: '#ff6a2b',
    icon: '#9ca3af',
    tabIconDefault: '#9ca3af',
    tabIconSelected: '#ff6a2b',
  },
} as const;
