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
// 시스템 글꼴 크기 배율의 상한. AppText(Text)와 AppTextInput(TextInput)이
// 이 값을 공유한다 — 앱의 모든 글자가 두 통로 중 하나를 지나므로 여기 한 곳이
// 전역 상한이 된다.
//
// ⭐ 1.2인 이유 (2026-08-31 실측): 1.2는 멀쩡하고 1.3부터 전부 잘린다. 점진적
// 악화가 아니라 절벽이다 — 원인은 폭 부족이 아니라 안드로이드가 Pretendard
// 텍스트 폭을 실제 글리프보다 좁게 재는 문제이고, 그 오차가 배율에 비례해
// 커지기 때문이다. 1.3에서는 @gp123→@gp12, 나라→나, 대한민국→대한민처럼
// 글자가 통째로 사라진다.
//
// ⚠️ 이건 근본 해결이 아니라 회피다. 진짜 원인은 폰트 측정 폭이고, 상한은
// 증상이 드러나는 지점을 밀어낸 것뿐이다. 폰트를 바꾸거나 측정 문제가
// 해결되면 상한을 다시 올릴 수 있다.
//
// ⚠️ 개별 화면에서 더 낮은 상한이 필요하면 그 Text에 직접 주면 덮어쓴다.
export const MAX_FONT_SCALE = 1.2;

export function Text({ style, maxFontSizeMultiplier, ...props }: TextProps) {
  return (
    <RNText
      style={[{ fontFamily: theme.fonts.regular }, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      {...props}
    />
  );
}
