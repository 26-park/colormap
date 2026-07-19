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
  // Pretendard 정적 OTF 5종(assets/fonts/) — weight별 fontFamily. 가변 폰트 대신
  // 정적 파일을 쓰는 이유와 fontWeight를 같이 쓰면 안 되는 이유는 AppText.tsx 참고.
  fonts: {
    regular: 'Pretendard-Regular', // 400
    medium: 'Pretendard-Medium', // 500
    semibold: 'Pretendard-SemiBold', // 600
    bold: 'Pretendard-Bold', // 700
    extrabold: 'Pretendard-ExtraBold', // 800
  },
} as const;

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
