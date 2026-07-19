import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';
import { LEGAL_URLS } from '@/constants/legal';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

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
});
