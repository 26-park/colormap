import { Text as RNText, type TextProps } from 'react-native';
import { theme } from '@/constants/theme';

// react-native의 Text를 대체하는 컴포넌트 — 다른 파일은 import만
// `import { Text } from '@/components/AppText'`로 바꾸면 JSX(<Text>)는 그대로
// 둬도 기본 폰트가 Pretendard-Regular로 적용된다. 이 앱 텍스트가 거의 전부
// 한글이라, fontFamily를 명시 안 한 곳까지 시스템 기본 폰트로 남으면 화면
// 하나 안에서 폰트가 반쯤만 바뀐 티가 나서(한글 자형 차이가 큼) 이 기본값이
// 필요하다.
//
// fontWeight가 있는 스타일은 이 기본값과 별개로 각자 fontFamily를 명시적으로
// 덮어써야 한다 — 커스텀 폰트에 fontWeight를 같이 주면 안드로이드/iOS 둘 다
// 가짜 볼드(synthetic bold)나 시스템 폰트 폴백이 나는 게 알려진 문제라(Expo
// 공식 문서도 정적 파일+weight별 fontFamily를 권장), 정적 OTF 5종을 weight마다
// 별도 fontFamily로 등록해서 쓴다(theme.ts의 fonts.regular/medium/semibold/
// bold/extrabold). fontWeight 키 자체를 남기면 안 됨.
//
// ⚠️ 새 화면에서 실수로 'react-native'에서 바로 Text를 import하면 이 기본값이
// 안 걸린다 — 반드시 이 파일에서 import할 것.
export function Text({ style, ...props }: TextProps) {
  return <RNText style={[{ fontFamily: theme.fonts.regular }, style]} {...props} />;
}
