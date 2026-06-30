import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

export default function ExploreScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>🔍</Text>
        <Text style={styles.title}>곧 만나요</Text>
        <Text style={styles.subtitle}>탐색 기능을 준비 중이에요</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
});
