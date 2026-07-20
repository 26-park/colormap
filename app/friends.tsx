import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { ErrorView } from '@/components/ErrorView';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

type Tab = 'friends' | 'received';

type MatchedProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

// 상태머신 매핑표(설계 2단계-B)의 5개 상태 중 "본인"은 검색 쿼리에서 이미
// neq로 제외되므로 여기선 나머지 4개만 다룬다.
type RelationshipKind = 'none' | 'sent' | 'received' | 'friends';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no-match' }
  | { status: 'found'; profile: MatchedProfile; relationship: RelationshipKind };

// Postgres uuid 비교는 표준 소문자 정형 문자열(8-4-4-4-12, 하이픈 고정 위치)의
// 문자열 비교와 동치 — 초기 스키마의 least(a,b)/greatest(a,b)와 같은 규칙을
// 클라이언트에서 그대로 재현한다.
function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export default function FriendsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const myId = session?.user.id;

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('friends');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  // 요청 보내기/취소 진행 중 버튼 이중 탭 방지.
  const [actionPending, setActionPending] = useState(false);

  async function fetchRelationship(me: string, other: string): Promise<RelationshipKind | null> {
    const [low, high] = sortedPair(me, other);
    const { data, error } = await supabase
      .from('friendships')
      .select('status, requested_by')
      .eq('user_low', low)
      .eq('user_high', high)
      .maybeSingle();

    if (error) {
      console.error('친구 관계 조회 실패:', error);
      return null;
    }
    if (!data) return 'none';
    if (data.status === 'accepted') return 'friends';
    return data.requested_by === me ? 'sent' : 'received';
  }

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed || !myId) return;

    setSearch({ status: 'loading' });

    // citext라 대소문자 무시 정확 일치.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('username', trimmed)
      .neq('id', myId)
      .maybeSingle();

    if (profileError) {
      console.error('친구 검색 실패:', profileError);
      setSearch({ status: 'error' });
      return;
    }

    if (!profile) {
      setSearch({ status: 'no-match' });
      return;
    }

    const relationship = await fetchRelationship(myId, profile.id);
    if (relationship === null) {
      // 검색 자체는 성공했지만 버튼을 정확히 그릴 관계 정보가 없으므로
      // 조용히 "요청 보내기"를 보여주는 대신 에러로 처리해 재시도를 유도한다.
      setSearch({ status: 'error' });
      return;
    }

    setSearch({ status: 'found', profile, relationship });
  }

  function handleChangeQuery(text: string) {
    setQuery(text);
    // 완료된 검색 결과를 그대로 둔 채 입력만 바뀌면 화면과 실제 조건이
    // 어긋나므로, 편집 즉시 무효화한다(재검색 전까지 idle).
    if (search.status !== 'idle') setSearch({ status: 'idle' });
  }

  async function handleSendRequest() {
    if (search.status !== 'found' || !myId || actionPending) return;
    const { profile } = search;
    const [low, high] = sortedPair(myId, profile.id);

    setActionPending(true);
    setSearch({ status: 'found', profile, relationship: 'sent' }); // 낙관적

    const { error } = await supabase
      .from('friendships')
      .insert({ user_low: low, user_high: high, requested_by: myId });

    setActionPending(false);
    if (!error) return;

    if (error.code === '23505') {
      // 레이스: 그새(동시 양방향 요청 등) 관계가 생김 — 에러 배너 대신 실제
      // 상태를 재조회해서 보여준다.
      const relationship = await fetchRelationship(myId, profile.id);
      setSearch({ status: 'found', profile, relationship: relationship ?? 'none' });
      return;
    }

    console.error('요청 보내기 실패:', error);
    setSearch({ status: 'found', profile, relationship: 'none' }); // 원복
    Alert.alert('요청을 보내지 못했어요', '다시 시도해주세요.');
  }

  async function handleCancelRequest() {
    if (search.status !== 'found' || !myId || actionPending) return;
    const { profile } = search;
    const [low, high] = sortedPair(myId, profile.id);

    setActionPending(true);
    setSearch({ status: 'found', profile, relationship: 'none' }); // 낙관적

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_low', low)
      .eq('user_high', high);

    setActionPending(false);
    if (error) {
      console.error('요청 취소 실패:', error);
      setSearch({ status: 'found', profile, relationship: 'sent' }); // 원복
      Alert.alert('취소하지 못했어요', '다시 시도해주세요.');
    }
  }

  const searching = query.trim().length > 0;

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
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="아이디를 정확히 입력하세요"
            placeholderTextColor={theme.colors.placeholder}
            value={query}
            onChangeText={handleChangeQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <Pressable style={styles.searchBtn} onPress={runSearch}>
            <Text style={styles.searchBtnIcon}>🔍</Text>
          </Pressable>
        </View>
        <Text style={styles.searchCaption}>정확한 아이디로만 검색할 수 있어요</Text>
      </View>

      {searching ? (
        <View style={styles.body}>
          {search.status === 'loading' && (
            <ActivityIndicator color={theme.colors.accent} />
          )}
          {search.status === 'error' && <ErrorView onRetry={runSearch} />}
          {search.status === 'no-match' && (
            <Text style={styles.emptyText}>일치하는 아이디가 없어요</Text>
          )}
          {search.status === 'idle' && (
            <Text style={styles.emptyText}>검색 버튼을 눌러 찾아보세요</Text>
          )}
          {search.status === 'found' && (
            <ResultCard
              profile={search.profile}
              relationship={search.relationship}
              actionPending={actionPending}
              onSend={handleSendRequest}
              onCancel={handleCancelRequest}
            />
          )}
        </View>
      ) : (
        <>
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

          {/* 목록 자리 — 3단계에서 실제 데이터 연결 */}
          <View style={styles.body}>
            <Text style={styles.emptyText}>
              {tab === 'friends'
                ? '아직 친구가 없어요\n아이디로 검색해서 친구를 추가해보세요'
                : '받은 요청이 없어요'}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// 검색으로 찾은 상대 카드 — 관계 상태에 따라 버튼을 분기한다(설계 2단계-B).
// '요청 보내기'는 relationship이 'none'일 때만 그려지므로, 받은 pending
// 상태에서 요청을 다시 보내 PK 충돌이 나는 경로 자체가 UI에 없다.
// 수락/거절/끊기는 이번 단계에서 다루지 않아 View(비활성)로만 자리를 둔다 —
// 3단계에서 Pressable + 핸들러로 교체 예정.
function ResultCard({
  profile,
  relationship,
  actionPending,
  onSend,
  onCancel,
}: {
  profile: MatchedProfile;
  relationship: RelationshipKind;
  actionPending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultAvatar}>
        <Text style={styles.resultAvatarEmoji}>🌍</Text>
      </View>
      <Text style={styles.resultUsername}>@{profile.username}</Text>

      {relationship === 'none' && (
        <Pressable
          style={[styles.actionBtn, actionPending && styles.actionBtnDisabled]}
          onPress={onSend}
          disabled={actionPending}
        >
          <Text style={styles.actionBtnText}>요청 보내기</Text>
        </Pressable>
      )}
      {relationship === 'sent' && (
        <Pressable
          style={[styles.actionBtnOutline, actionPending && styles.actionBtnDisabled]}
          onPress={onCancel}
          disabled={actionPending}
        >
          <Text style={styles.actionBtnOutlineText}>요청됨</Text>
        </Pressable>
      )}
      {relationship === 'received' && (
        <View style={styles.receivedBtns}>
          <View style={[styles.actionBtn, styles.placeholderBtn]}>
            <Text style={styles.actionBtnText}>수락</Text>
          </View>
          <View style={[styles.actionBtnOutline, styles.placeholderBtn]}>
            <Text style={styles.actionBtnOutlineText}>거절</Text>
          </View>
        </View>
      )}
      {relationship === 'friends' && (
        <View style={[styles.actionBtnOutline, styles.placeholderBtn]}>
          <Text style={styles.actionBtnOutlineText}>친구</Text>
        </View>
      )}
    </View>
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
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.input,
    paddingHorizontal: 16,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#fff',
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.input,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnIcon: {
    fontSize: 18,
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

  // 검색 결과 카드
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 14,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  resultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarEmoji: {
    fontSize: 20,
  },
  resultUsername: {
    flex: 1,
    fontSize: 15,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
  },

  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.accent,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: theme.fonts.bold,
    color: '#fff',
  },
  actionBtnOutline: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontFamily: theme.fonts.bold,
    color: theme.colors.accent,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  // 수락/거절/친구 — 이번 단계는 핸들러가 없는 자리만(3단계에서 교체).
  placeholderBtn: {
    opacity: 0.4,
  },
  receivedBtns: {
    flexDirection: 'row',
    gap: 8,
  },
});
