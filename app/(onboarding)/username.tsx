import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { theme } from '@/constants/theme';

// 소문자 영문·숫자·언더스코어, 3~20자
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function UsernameScreen() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<CheckStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // username 변경 시 디바운스 중복 체크
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (username.length === 0) {
      setStatus('idle');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setStatus('invalid');
      return;
    }

    setStatus('checking');
    debounceTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      setStatus(data ? 'taken' : 'available');
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [username]);

  const handleSubmit = async () => {
    if (status !== 'available' || !session) return;
    setSubmitError(null);
    setSubmitting(true);

    const { error } = await supabase
      .from('profiles')
      .insert({ id: session.user.id, username });

    setSubmitting(false);

    if (error) {
      // unique violation = 제출 직전 다른 사람이 먼저 가져간 경우
      if (error.code === '23505') {
        setStatus('taken');
      } else {
        setSubmitError('오류가 발생했습니다. 다시 시도해주세요.');
      }
      return;
    }

    // 성공 → auth context가 hasProfile = true로 갱신 → _layout이 (tabs)로 리다이렉트
    await refreshProfile();
  };

  const canSubmit = status === 'available' && !submitting;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.logoText}>colormap</Text>
            <Text style={styles.title}>username을 정해주세요</Text>
            <Text style={styles.subtitle}>
              다른 사람들이 나를 찾을 때 쓰는 이름이에요.{'\n'}
              영문 소문자·숫자·_만 사용 가능, 3~20자
            </Text>
          </View>

          {/* 입력 */}
          <View style={styles.inputWrapper}>
            <View style={[
              styles.inputRow,
              status === 'available' && styles.inputRowAvailable,
              status === 'taken' && styles.inputRowTaken,
              status === 'invalid' && styles.inputRowTaken,
            ]}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="username"
                placeholderTextColor={theme.colors.placeholder}
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                maxLength={20}
              />
              {status === 'checking' && (
                <ActivityIndicator size="small" color={theme.colors.placeholder} style={styles.statusIcon} />
              )}
            </View>

            <StatusHint status={status} username={username} />
          </View>

          {submitError && <Text style={styles.submitError}>{submitError}</Text>}

          {/* 시작하기 버튼 */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && canSubmit && styles.buttonPressed,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>시작하기</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatusHint({ status, username }: { status: CheckStatus; username: string }) {
  if (status === 'idle') return null;
  if (status === 'checking') return <Text style={styles.hintNeutral}>확인 중...</Text>;
  if (status === 'available') return <Text style={styles.hintAvailable}>✓ 사용 가능한 username이에요</Text>;
  if (status === 'taken') return <Text style={styles.hintTaken}>✗ 이미 사용 중인 username이에요</Text>;
  if (status === 'invalid') {
    if (username.length < 3) return <Text style={styles.hintTaken}>최소 3자 이상 입력해주세요</Text>;
    return <Text style={styles.hintTaken}>영문 소문자·숫자·_만 사용 가능해요</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 12,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.accent,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputWrapper: {
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.input,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  inputRowAvailable: {
    borderColor: '#22c55e',
  },
  inputRowTaken: {
    borderColor: theme.colors.error,
  },
  atSign: {
    fontSize: 17,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  statusIcon: {
    marginLeft: 8,
  },
  hintNeutral: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingHorizontal: 4,
  },
  hintAvailable: {
    fontSize: 13,
    color: '#22c55e',
    paddingHorizontal: 4,
  },
  hintTaken: {
    fontSize: 13,
    color: theme.colors.error,
    paddingHorizontal: 4,
  },
  submitError: {
    fontSize: 13,
    color: theme.colors.error,
    textAlign: 'center',
  },
  button: {
    height: 52,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
