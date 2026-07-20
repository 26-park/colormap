import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';

type Tab = 'friends' | 'received';

// 화면 뼈대 단계 — 검색/목록 조회는 2·3단계에서 연결. 지금은 세그먼트 전환과
// 빈 상태 문구만 실제로 동작한다.
export default function FriendsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('friends');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>친구</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* 검색바 — 부분검색이 아니라 정확 일치라는 걸 캡션으로 항상 알려준다 */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="아이디를 정확히 입력하세요"
          placeholderTextColor={theme.colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Text style={styles.searchCaption}>정확한 아이디로만 검색할 수 있어요</Text>
      </View>

      {/* 세그먼트 */}
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, tab === 'friends' && styles.segmentBtnActive]}
          onPress={() => setTab('friends')}
        >
          <Text style={[styles.segmentText, tab === 'friends' && styles.segmentTextActive]}>
            친구
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, tab === 'received' && styles.segmentBtnActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.segmentText, tab === 'received' && styles.segmentTextActive]}>
            받은 요청
          </Text>
        </Pressable>
      </View>

      {/* 목록 자리 — 지금은 항상 빈 상태 */}
      <View style={styles.body}>
        <Text style={styles.emptyText}>
          {tab === 'friends'
            ? '아직 친구가 없어요\n아이디로 검색해서 친구를 추가해보세요'
            : '받은 요청이 없어요'}
        </Text>
      </View>
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

  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 6,
  },
  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.input,
    paddingHorizontal: 16,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#fff',
  },
  searchCaption: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },

  segment: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: theme.radius.card,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.input,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.accent,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
  },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
