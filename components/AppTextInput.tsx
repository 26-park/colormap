import { TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { theme } from '@/constants/theme';
import { MAX_FONT_SCALE } from '@/components/AppText';

// react-native의 TextInput을 대체하는 컴포넌트 — AppText와 같은 역할을
// 입력란에 대해 한다. 다른 파일은 import만
// `import { TextInput } from '@/components/AppTextInput'`로 바꾸면 JSX는 그대로
// 둬도 된다.
//
// ⚠️ AppText는 Text만 감싸므로 TextInput은 글꼴 배율 상한이 **전혀 걸리지
// 않았다**(2026-08-31 발견). 시스템 배율 2.0에서 친구 검색창 placeholder가
// 글자끼리 겹쳐 뭉개지는 걸로 드러났다 — 앱 안의 입력란 8곳이 전부 무방비였다.
// 상한 없이 2.0까지 커지면 고정 높이(52dp/48dp) 입력란을 글자가 넘어선다.
//
// 기본 fontFamily도 같이 준다 — 대부분의 입력란이 fontFamily 지정 없이
// 시스템 폰트로 렌더되고 있었다(게시물 댓글 입력만 예외적으로 명시돼 있었음).
// 스타일 배열에서 기본값이 앞에 오므로 호출부가 지정한 값이 항상 이긴다.
export function TextInput({ style, maxFontSizeMultiplier, ...props }: TextInputProps) {
  return (
    <RNTextInput
      style={[{ fontFamily: theme.fonts.regular }, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      {...props}
    />
  );
}
