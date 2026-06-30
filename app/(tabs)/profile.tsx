import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '@/context/auth';
import { theme } from '@/constants/theme';

// TODO: 프로필 화면으로 교체 (다음 단계)
export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    // 로그아웃 후 _layout.tsx의 session 감지가 자동으로 로그인 화면으로 이동
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>👤</Text>
        <Text style={styles.title}>프로필</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Text style={styles.subtitle}>프로필 화면 준비 중</Text>

        <Pressable
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          onPress={handleSignOut}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={theme.colors.accent} />
            : <Text style={styles.signOutText}>로그아웃</Text>
          }
        </Pressable>
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
  emoji: {
    fontSize: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  email: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.button,
  },
  pressed: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});
