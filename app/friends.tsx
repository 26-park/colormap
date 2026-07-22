import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
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

// 탭 목록(친구 / 받은 요청) 상태 — 빈 배열('ready' + rows 0)은 에러가 아니라
// 빈 상태로 렌더한다(조용한 실패 금지 원칙: 실패는 항상 ErrorView+재시도).
type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: MatchedProfile[] };

// 수락 시도의 결과. ⚠️ RLS UPDATE가 USING에서 걸리면 에러가 아니라 "0행"으로
// 조용히 끝나므로(Phase N 검증 시나리오 7), 영향 행 수를 반드시 확인하고
// 0행이면 그 관계만 재조회해 실제 상태로 갈라놓는다.
type AcceptOutcome =
  | 'accepted' // 1행 업데이트 — 정상 수락
  | 'already-friends' // 0행이지만 재조회하니 이미 친구(중복 수락 등)
  | 'gone' // 0행 + 관계 자체가 사라짐(상대가 그새 취소) — 에러 아님
  | 'blocked' // 0행인데 여전히 pending — 정말로 막힌 것
  | 'error'; // 네트워크/서버 에러

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
  // 목록에서 수락 처리 중인 상대 id(행 단위 버튼 비활성).
  const [actingId, setActingId] = useState<string | null>(null);

  const [list, setList] = useState<ListState>({ status: 'loading' });
  // 탭을 빠르게 오갈 때 늦게 도착한 응답이 최신 목록을 덮어쓰지 않게 하는 토큰
  // (프로필 D-2 / 나라상세 Phase I와 같은 패턴).
  const listRequestIdRef = useRef(0);

  const loadList = useCallback(async () => {
    if (!myId) return;
    const reqId = ++listRequestIdRef.current;
    setList({ status: 'loading' });

    const base = supabase
      .from('friendships')
      .select('user_low, user_high')
      .or(`user_low.eq.${myId},user_high.eq.${myId}`);
    // 받은 요청 = pending 중 내가 보낸 게 아닌 것.
    const { data: rels, error: relError } =
      tab === 'friends'
        ? await base.eq('status', 'accepted')
        : await base.eq('status', 'pending').neq('requested_by', myId);

    if (reqId !== listRequestIdRef.current) return;
    if (relError) {
      console.error('친구 목록 조회 실패:', relError);
      setList({ status: 'error' });
      return;
    }

    const otherIds = (rels ?? []).map((r) => (r.user_low === myId ? r.user_high : r.user_low));
    if (otherIds.length === 0) {
      setList({ status: 'ready', rows: [] });
      return;
    }

    // 상대 프로필은 2차 쿼리로 병합(friendships에 profiles FK 조인을 걸지 않는
    // 설계 — user_low/user_high 어느 쪽이 상대인지가 행마다 달라서 조인이 안 맞음).
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', otherIds);

    if (reqId !== listRequestIdRef.current) return;
    if (profileError) {
      console.error('친구 프로필 조회 실패:', profileError);
      setList({ status: 'error' });
      return;
    }

    const rows = (profiles ?? []).sort((a, b) => a.username.localeCompare(b.username));
    setList({ status: 'ready', rows });
  }, [myId, tab]);

  // 포커스마다 + 탭 전환마다 재조회. useFocusEffect는 콜백 identity가 바뀌면
  // 포커스 상태에서도 즉시 재실행된다(Phase I에서 확인한 동작).
  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList]),
  );

  // 수락 = pending → accepted UPDATE. 성공/실패를 호출부가 각자 UI에 반영할 수
  // 있게 결과만 돌려준다(목록 행과 검색 결과 카드가 같은 로직을 공유).
  async function acceptRequest(otherId: string): Promise<AcceptOutcome> {
    if (!myId) return 'error';
    const [low, high] = sortedPair(myId, otherId);

    // .select()로 영향 행 수를 반드시 확인 — RLS USING 위반은 에러가 아니라 0행이다.
    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_low', low)
      .eq('user_high', high)
      .eq('status', 'pending')
      .select('user_low');

    if (error) {
      console.error('요청 수락 실패:', error);
      return 'error';
    }
    if (data && data.length > 0) return 'accepted';

    // 0행 — "성공"으로 취급하지 않고 그 관계만 타겟 재조회해 실제 상태를 확인한다.
    const relationship = await fetchRelationship(myId, otherId);
    if (relationship === null) return 'error';
    if (relationship === 'friends') return 'already-friends';
    if (relationship === 'none') return 'gone';
    return 'blocked';
  }

  async function handleAcceptFromList(other: MatchedProfile) {
    if (actingId) return;
    setActingId(other.id);
    const outcome = await acceptRequest(other.id);
    setActingId(null);

    if (outcome === 'error' || outcome === 'blocked') {
      Alert.alert('수락하지 못했어요', '다시 시도해주세요.');
      return;
    }
    // accepted / already-friends / gone 전부 "받은 요청"에서는 빠진다.
    // gone(상대가 그새 취소)은 에러 배너가 아니라 조용한 갱신으로 처리한다.
    setList((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', rows: prev.rows.filter((r) => r.id !== other.id) }
        : prev,
    );
  }

  async function handleAcceptFromSearch() {
    if (search.status !== 'found' || actionPending) return;
    const { profile } = search;

    setActionPending(true);
    const outcome = await acceptRequest(profile.id);
    setActionPending(false);

    if (outcome === 'error' || outcome === 'blocked') {
      Alert.alert('수락하지 못했어요', '다시 시도해주세요.');
      return;
    }
    setSearch({
      status: 'found',
      profile,
      relationship: outcome === 'gone' ? 'none' : 'friends',
    });
    // 검색 UI에 가려져 있는 탭 목록도 최신화 — 검색어를 지우고 돌아왔을 때
    // 방금 수락한 친구가 빠져 있는 걸 막는다(탭 전환이 없어 재조회가 안 걸림).
    void loadList();
  }

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
              onAccept={handleAcceptFromSearch}
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

          {list.status === 'loading' && (
            <View style={styles.body}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          )}
          {list.status === 'error' && (
            <View style={styles.body}>
              <ErrorView onRetry={loadList} />
            </View>
          )}
          {list.status === 'ready' && list.rows.length === 0 && (
            <View style={styles.body}>
              <Text style={styles.emptyText}>
                {tab === 'friends'
                  ? '아직 친구가 없어요\n아이디로 검색해서 친구를 추가해보세요'
                  : '받은 요청이 없어요'}
              </Text>
            </View>
          )}
          {list.status === 'ready' && list.rows.length > 0 && (
            <FlatList
              data={list.rows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <PersonRow
                  profile={item}
                  tab={tab}
                  acting={actingId === item.id}
                  disabled={actingId !== null}
                  onAccept={() => handleAcceptFromList(item)}
                />
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

// 검색으로 찾은 상대 카드 — 관계 상태에 따라 버튼을 분기한다(설계 2단계-B).
// '요청 보내기'는 relationship이 'none'일 때만 그려지므로, 받은 pending
// 상태에서 요청을 다시 보내 PK 충돌이 나는 경로 자체가 UI에 없다.
// 수락은 3A에서 연결됐고, 거절/끊기는 아직 View(비활성)로 자리만 둔다 —
// 3B에서 Pressable + 핸들러로 교체 예정.
function ResultCard({
  profile,
  relationship,
  actionPending,
  onSend,
  onCancel,
  onAccept,
}: {
  profile: MatchedProfile;
  relationship: RelationshipKind;
  actionPending: boolean;
  onSend: () => void;
  onCancel: () => void;
  onAccept: () => void;
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
          <Pressable
            style={[styles.actionBtn, actionPending && styles.actionBtnDisabled]}
            onPress={onAccept}
            disabled={actionPending}
          >
            <Text style={styles.actionBtnText}>수락</Text>
          </Pressable>
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

// 탭 목록의 한 행. 검색 결과 카드와 같은 레이아웃을 쓰되, 액션만 탭별로 다르다
// (받은 요청 = 수락/거절, 친구 = 끊기 — 거절·끊기는 3B에서 연결).
function PersonRow({
  profile,
  tab,
  acting,
  disabled,
  onAccept,
}: {
  profile: MatchedProfile;
  tab: Tab;
  acting: boolean;
  disabled: boolean;
  onAccept: () => void;
}) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultAvatar}>
        <Text style={styles.resultAvatarEmoji}>🌍</Text>
      </View>
      <Text style={styles.resultUsername}>@{profile.username}</Text>

      {tab === 'received' ? (
        <View style={styles.receivedBtns}>
          <Pressable
            style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
            onPress={onAccept}
            disabled={disabled}
          >
            {acting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>수락</Text>
            )}
          </Pressable>
          <View style={[styles.actionBtnOutline, styles.placeholderBtn]}>
            <Text style={styles.actionBtnOutlineText}>거절</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.actionBtnOutline, styles.placeholderBtn]}>
          <Text style={styles.actionBtnOutlineText}>친구 끊기</Text>
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

  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 10,
  },

  // 검색 결과 카드 / 목록 행 공용
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
