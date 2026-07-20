import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';
import { VISIBILITY_LABELS, VISIBILITY_OPTIONS, type PostVisibility } from '@/lib/posts';

type Props = {
  value: PostVisibility;
  onChange: (value: PostVisibility) => void;
};

// compose(작성)와 게시물 상세(편집)가 공유하는 공개범위 세그먼트 토글.
// hidden 옵션은 현재 선택값일 때만 예외적으로 보여준다 — lib/posts.ts 참고.
export function VisibilitySelector({ value, onChange }: Props) {
  const visibleOptions = VISIBILITY_OPTIONS.filter((opt) => !opt.hidden || opt.value === value);

  return (
    <View style={styles.toggle}>
      {visibleOptions.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.btn, opt.value === value && styles.btnActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.btnText, opt.value === value && styles.btnTextActive]}>
            {VISIBILITY_LABELS[opt.value]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: theme.radius.card,
    padding: 4,
    gap: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.input,
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: theme.colors.accent,
  },
  btnText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  btnTextActive: {
    color: '#fff',
  },
});
