import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { ErrorView } from '@/components/ErrorView';
import { theme } from '@/constants/theme';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

type AccountVisibility = 'public' | 'private';

export default function SettingsScreen() {
  const { signOut, session } = useAuth();
  const router = useRouter();

  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // 계정 공개범위 — profiles.visibility. 조용한 실패 금지 원칙(Phase J)대로
  // 실패 시 compact ErrorView + 재시도, 저장 실패 시엔 토글을 원복한다.
  const [accountVisibility, setAccountVisibility] = useState<AccountVisibility | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(true);
  const [visibilityError, setVisibilityError] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const loadVisibility = useCallback(() => {
    if (!session) return;
    setVisibilityLoading(true);
    setVisibilityError(false);
    supabase
      .from('profiles')
      .select('visibility')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('[P2] 계정 공개범위 조회 실패:', error);
          setVisibilityError(true);
          setVisibilityLoading(false);
          return;
        }
        setAccountVisibility(data.visibility);
        setVisibilityLoading(false);
      });
  }, [session]);

  useEffect(() => {
    loadVisibility();
  }, [loadVisibility]);

  async function saveVisibility(next: AccountVisibility) {
    if (!session) return;
    const prev = accountVisibility;
    setAccountVisibility(next);
    setSavingVisibility(true);

    const { error } = await supabase
      .from('profiles')
      .update({ visibility: next })
      .eq('id', session.user.id);

    setSavingVisibility(false);
    if (error) {
      console.error('[P2] 계정 공개범위 변경 실패:', error);
      setAccountVisibility(prev);
      Alert.alert('변경하지 못했어요', '다시 시도해주세요.');
    }
  }

  function handleVisibilityToggle(nextIsPublic: boolean) {
    const next: AccountVisibility = nextIsPublic ? 'public' : 'private';
    if (next === 'private') {
      saveVisibility(next);
      return;
    }
    // 비공개 → 전체공개만 확인 다이얼로그: 노출 범위가 갑자기 늘어나는 방향이라서.
    Alert.alert(
      '계정을 전체공개로 전환할까요?',
      '전체공개로 설정한 게시물이 모든 사람에게 보이게 됩니다. 친구공개·비공개로 설정한 게시물은 계속 보호돼요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '전체공개로 전환', onPress: () => saveVisibility(next) },
      ],
    );
  }

  const handleSignOut = () => {
    Alert.alert('로그아웃할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
        },
      },
    ]);
  };

  // P0 계정 삭제. Edge Function(supabase/functions/delete-account)이 본인 확인(JWT) +
  // Storage 정리 + auth.admin.deleteUser()로 DB cascade까지 전부 처리 — 여기선 호출과
  // 로그인 세션 정리만 담당한다.
  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) {
        console.error('[account-delete] delete-account 호출 실패:', error);
        Alert.alert('삭제하지 못했어요', '다시 시도해주세요.');
        setDeletingAccount(false);
        return;
      }
      // auth.admin.deleteUser()로 서버 세션은 이미 무효화됨 — signOut()으로 로컬
      // 세션/Google 캐시까지 정리해야 "유저 없는데 세션만 남은" 상태를 피할 수 있다.
      await signOut();
    } catch (err) {
      console.error('[account-delete] 예외:', err);
      Alert.alert('삭제하지 못했어요', '다시 시도해주세요.');
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '계정을 삭제할까요?',
      '계정을 삭제하면 모든 기록과 사진이 영구 삭제되며 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '정말 삭제하시겠어요?',
              '이 작업은 되돌릴 수 없습니다. 계정과 모든 기록, 사진이 영구적으로 사라집니다.',
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '영구 삭제',
                  style: 'destructive',
                  onPress: confirmDeleteAccount,
                },
              ],
            );
          },
        },
      ],
    );
  };

  const appVersion = Constants.expoConfig?.version ?? '-';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 계정 */}
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.card}>
          <View style={styles.visibilityRow}>
            <View style={styles.visibilityTextWrap}>
              <Text style={styles.rowText}>계정 공개범위</Text>
              {accountVisibility && !visibilityError && (
                <Text style={styles.rowCaption}>
                  {accountVisibility === 'private'
                    ? '비공개 — 친구만 내 기록을 볼 수 있어요. 게시물별 공개범위는 그대로 유지돼요.'
                    : '전체공개 — 모든 사람이 내 기록을 볼 수 있어요.'}
                </Text>
              )}
            </View>
            {visibilityLoading ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              !visibilityError &&
              accountVisibility && (
                <Switch
                  value={accountVisibility === 'public'}
                  onValueChange={handleVisibilityToggle}
                  disabled={savingVisibility}
                  trackColor={{ true: theme.colors.accent }}
                />
              )
            )}
          </View>
          {visibilityError && (
            <View style={styles.visibilityErrorWrap}>
              <ErrorView compact onRetry={loadVisibility} />
            </View>
          )}
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={handleSignOut} disabled={signingOut}>
            <Text style={styles.rowText}>로그아웃</Text>
            {signingOut && <ActivityIndicator size="small" color={theme.colors.textSecondary} />}
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={handleDeleteAccount} disabled={deletingAccount}>
            <Text style={styles.rowTextDanger}>계정 삭제</Text>
            {deletingAccount && <ActivityIndicator size="small" color={theme.colors.error} />}
          </Pressable>
        </View>

        {/* 약관 */}
        <Text style={styles.sectionTitle}>약관</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => Linking.openURL(LEGAL_URLS.terms)}>
            <Text style={styles.rowText}>이용약관</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(LEGAL_URLS.privacy)}>
            <Text style={styles.rowText}>개인정보처리방침</Text>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>버전</Text>
            <Text style={styles.rowValue}>{appVersion}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: theme.colors.text,
    lineHeight: 24,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: theme.radius.card,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 16,
  },
  rowText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  rowTextDanger: {
    fontSize: 15,
    color: theme.colors.error,
  },
  rowValue: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },

  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  visibilityTextWrap: {
    flex: 1,
    gap: 4,
  },
  rowCaption: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  visibilityErrorWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
