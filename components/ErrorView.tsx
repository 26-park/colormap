import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';

type ErrorViewProps = {
  message?: string;
  onRetry: () => void;
  // 페이지네이션 중간 실패 등 리스트를 유지한 채 한 줄로만 보여줄 때 사용 —
  // 빈 상태(문구만, 버튼 없음)와 달리 항상 "다시 시도" 액션을 갖는다.
  compact?: boolean;
};

export function ErrorView({ message = '불러오지 못했어요', onRetry, compact = false }: ErrorViewProps) {
  if (compact) {
    return (
      <Pressable style={styles.compactRow} onPress={onRetry}>
        <Text style={styles.compactText}>
          {message} · <Text style={styles.compactRetry}>다시 시도</Text>
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.accent,
  },
  retryText: {
    fontSize: 14,
    fontFamily: theme.fonts.bold,
    color: '#fff',
  },
  compactRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  compactText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  compactRetry: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.bold,
    textDecorationLine: 'underline',
  },
});
