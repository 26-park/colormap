import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Map, Camera, Marker, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { Text } from '@/components/AppText';
import { VisibilitySelector } from '@/components/VisibilitySelector';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { resolveMediaUrls } from '@/lib/media';
import { deletePost, VISIBILITY_LABELS, type PostVisibility } from '@/lib/posts';
import { getLikeState, setLike } from '@/lib/likes';
import {
  listComments,
  getCommentCount,
  createComment,
  removeComment,
  validateCommentBody,
  CommentBodyRejectedError,
  COMMENT_MAX_LENGTH,
  type Comment,
} from '@/lib/comments';
import * as Crypto from 'expo-crypto';
import { getCountryName } from '@/lib/countryFromCoord';
import { getCountryNameKo } from '@/lib/countryNamesKo';
import { useAuth } from '@/context/auth';
import { ErrorView } from '@/components/ErrorView';
import countriesGeoJSON from '@/assets/geo/countries.json';

const SCREEN_WIDTH = Dimensions.get('window').width;

// 위치 미니맵용 인라인 스타일 — compose 작성 폼의 위치 선택 미니맵과 동일한 배경만.
const PREVIEW_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#EBF1F7' } },
  ],
};

type PostDetail = {
  userId: string;
  caption: string | null;
  placeLabel: string | null;
  visibility: PostVisibility;
  createdAt: string;
  takenAt: string | null;
  countryCode: string;
  coord: { lng: number; lat: number } | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// 댓글용 상대시간. 하루가 넘어가면 그냥 날짜로 — 목록이 오래된 순이라
// 오래된 댓글에 "30일 전" 같은 표기는 오히려 읽기 나쁘다.
function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return formatDate(iso);
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [carouselWidth, setCarouselWidth] = useState(SCREEN_WIDTH);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 재시도 버튼이 누르면 값을 올려 아래 useEffect를 다시 실행시키는 트리거 —
  // 쿼리 자체는 그대로, id가 안 바뀌어도 같은 조회를 다시 돌리기 위한 것.
  const [retryToken, setRetryToken] = useState(0);

  // 좋아요 (Phase P-2). 낙관적 토글 + 400ms 디바운스 최종상태 쓰기.
  //   serverLiked/serverCount = 마지막으로 서버에서 확정된 값
  //   pendingLiked            = 하트를 눌러 반영한 UI 의도값(즉각 반응)
  //   표시 개수 = serverCount + (pending≠server면 ±1) → 항상 파생값이라 원복이 깔끔.
  const userId = session?.user.id;
  const [serverLiked, setServerLiked] = useState(false);
  const [serverCount, setServerCount] = useState(0);
  const [pendingLiked, setPendingLiked] = useState(false);
  // flush 클로저가 최신 값을 보게 하는 ref들(리렌더와 무관하게 참조).
  const serverLikedRef = useRef(false);
  const pendingLikedRef = useRef(false);
  const likeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const unmountedRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  const displayCount = serverCount + (pendingLiked === serverLiked ? 0 : pendingLiked ? 1 : -1);

  // 댓글 (Phase Q-3). 목록은 오래된 순 전체 로드(limit 100).
  //   commentCount — 서버 기준 개수. 목록 상한(100)을 넘으면 목록보다 클 수 있어서
  //                  그 경우 "일부만 표시 중" 안내를 띄운다(승급 조건 신호).
  //   myProfile    — 낙관적 항목에 보여줄 내 표시 정보. 서버 응답이 오면 교체된다.
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsError, setCommentsError] = useState(false);
  const [myProfile, setMyProfile] = useState<{ username: string | null; avatarUrl: string | null }>({
    username: null,
    avatarUrl: null,
  });
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const draftReject = validateCommentBody(draft);
  const canSubmit = !submitting && draftReject === null;

  // pending과 server가 어긋나면 그 방향으로 1회 쓴다. 연타로 여러 번 뒤집혔어도
  // while로 최종상태에 수렴(setLike는 멱등 — 23505/0행 흡수). 진짜 에러만
  // 서버값으로 원복. 언마운트 후엔 setState/Alert를 건너뛴다(떠난 화면).
  const flushLike = useCallback(async () => {
    if (likeTimerRef.current) {
      clearTimeout(likeTimerRef.current);
      likeTimerRef.current = null;
    }
    if (flushingRef.current) return;
    if (!userId) return;
    if (pendingLikedRef.current === serverLikedRef.current) return;
    flushingRef.current = true;
    try {
      while (pendingLikedRef.current !== serverLikedRef.current) {
        const desired = pendingLikedRef.current;
        await setLike(id, userId, desired);
        serverLikedRef.current = desired;
        if (!unmountedRef.current) {
          setServerLiked(desired);
          setServerCount((c) => c + (desired ? 1 : -1));
        }
      }
    } catch (err) {
      console.error('[P-2] 좋아요 반영 실패:', err);
      const synced = serverLikedRef.current;
      pendingLikedRef.current = synced;
      if (!unmountedRef.current) {
        setPendingLiked(synced);
        Alert.alert('처리하지 못했어요', '다시 시도해주세요.');
      }
    } finally {
      flushingRef.current = false;
    }
  }, [id, userId]);

  // 하트 탭 — 즉각 반영 후 400ms 디바운스로 최종상태만 쓴다.
  const onToggleLike = useCallback(() => {
    if (!userId) return;
    const next = !pendingLikedRef.current;
    pendingLikedRef.current = next;
    setPendingLiked(next);
    if (likeTimerRef.current) clearTimeout(likeTimerRef.current);
    likeTimerRef.current = setTimeout(() => {
      void flushLike();
    }, 400);
  }, [userId, flushLike]);

  // 언마운트/화면 이탈 시 대기 중인 쓰기를 즉시 flush — 타이머 대기 중 떠나면
  // 쓰기가 유실돼 "하트 눌렀는데 다음 진입 시 빈 하트"가 되는 걸 막는다.
  // 떠난 화면이라 실패해도 원복 대상이 없어 조용히 둔다(다음 진입 시 서버값이 진실).
  flushRef.current = flushLike;
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      void flushRef.current();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setFetchError(false);
    setMediaLoadError(false);

    (async () => {
      // RLS(posts_select_visible)가 가시성을 강제하므로 쿼리는 id 필터만 건다.
      // posts.location(geography)은 그대로 select하면 WKB 16진수라 파싱이 안 돼서
      // posts_with_coords 뷰(ST_X/ST_Y로 lng/lat 미리 계산, Phase E)를 대신 조회한다.
      const { data, error } = await supabase
        .from('posts_with_coords')
        .select('user_id, caption, place_label, visibility, created_at, taken_at, country_code, lng, lat')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      // error 있으면 네트워크/서버 문제 — 재시도 가능한 에러로 처리.
      // error 없이 data만 없으면 삭제됐거나 볼 수 없는 게시물(정상적인 404).
      if (error) {
        console.error('[Phase E] 게시물 조회 실패:', error);
        setFetchError(true);
        setLoading(false);
        return;
      }
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPost({
        userId: data.user_id,
        caption: data.caption,
        placeLabel: data.place_label,
        visibility: data.visibility,
        createdAt: data.created_at,
        takenAt: data.taken_at,
        countryCode: data.country_code,
        coord: typeof data.lng === 'number' && typeof data.lat === 'number'
          ? { lng: data.lng, lat: data.lat }
          : null,
      });

      // post_media는 posts_with_coords가 아니라 원본 posts 기준 RLS로 가시성이
      // 걸려 있으므로(post_media_select_if_post_visible) 별도 조회.
      const { data: mediaRows, error: mediaError } = await supabase
        .from('post_media')
        .select('url, order_index')
        .eq('post_id', id)
        .order('order_index', { ascending: true });

      if (mediaError) {
        console.error('[Phase E] post_media 조회 실패:', mediaError);
        setMediaLoadError(true);
      }

      const rawUrls = (mediaRows ?? []).map((m) => m.url);
      const resolved = await resolveMediaUrls(rawUrls);

      if (cancelled) return;
      setPhotoUrls(rawUrls.map((u) => resolved[u]).filter((u): u is string => !!u));

      // 좋아요 상태 로드 (Phase P-2). 조회 실패는 조용히 넘기지 않고 전체
      // ErrorView로 — 재시도가 게시물/사진/좋아요를 함께 다시 불러온다.
      if (userId) {
        try {
          const likeState = await getLikeState(id, userId);
          if (cancelled) return;
          setServerLiked(likeState.likedByMe);
          setPendingLiked(likeState.likedByMe);
          setServerCount(likeState.count);
          serverLikedRef.current = likeState.likedByMe;
          pendingLikedRef.current = likeState.likedByMe;
        } catch (likeErr) {
          if (cancelled) return;
          console.error('[P-2] 좋아요 상태 조회 실패:', likeErr);
          setFetchError(true);
          setLoading(false);
          return;
        }

        // 댓글 (Q-3). 좋아요와 달리 여기서 실패해도 전체 ErrorView로 막지 않는다 —
        // 사진·글은 이미 볼 수 있으므로 댓글 영역만 재시도 가능한 에러로 표시한다.
        setCommentsError(false);
        try {
          const [rows, count] = await Promise.all([listComments(id), getCommentCount(id)]);
          if (cancelled) return;
          setComments(rows);
          setCommentCount(count);
        } catch (commentErr) {
          if (cancelled) return;
          console.error('[Q-3] 댓글 조회 실패:', commentErr);
          setCommentsError(true);
        }

        // 낙관적 항목에 쓸 내 표시 정보. 실패해도 조용히 넘어간다(이름 없이도
        // 작성 자체는 되고, 서버 응답이 오면 정확한 값으로 교체되므로).
        const { data: me } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        if (me) setMyProfile({ username: me.username, avatarUrl: me.avatar_url });
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, retryToken, userId]);

  function handleCarouselScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (carouselWidth === 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    setActiveIndex(index);
  }

  const countryName = post ? getCountryNameKo(post.countryCode, getCountryName(post.countryCode) ?? undefined) : null;
  const isOwner = !!post && !!session?.user.id && post.userId === session.user.id;

  // 삭제 확인 다이얼로그 문구용 — 이 나라의 내 게시물이 지금 게시물 1개뿐이면
  // 삭제 시 country_visits 색칠도 함께 사라진다(G-1 트리거)는 안내를 추가한다.
  async function handleDeletePress() {
    if (!post) return;
    setMenuOpen(false);

    const { count, error } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', post.userId)
      .eq('country_code', post.countryCode);

    if (error) {
      console.error('[E-2] 게시물 수 조회 실패:', error);
    }
    const isLastPost = (count ?? 0) === 1;

    Alert.alert(
      '기록을 삭제할까요?',
      isLastPost
        ? '사진도 함께 삭제됩니다. 되돌릴 수 없어요.\n이 나라의 마지막 기록이에요. 삭제하면 지도의 색칠도 사라집니다.'
        : '사진도 함께 삭제됩니다. 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => runDelete() },
      ],
    );
  }

  async function runDelete() {
    if (!id || !post) return;
    setDeleting(true);
    try {
      await deletePost(id);
      // 나라상세에서 들어온 경우 스택에 이미 그 화면이 있다 — replace로 새 인스턴스를
      // 또 쌓으면(스택에 나라상세가 중복돼) 뒤로가기 시 삭제 전 화면이 다시 보인다.
      // dismissTo는 스택에서 기존 나라상세를 찾아 그 화면까지 되돌아가고(포커스 시
      // useFocusEffect가 재조회), 못 찾으면 대신 replace한다 — 어느 진입 경로든 안전.
      router.dismissTo({ pathname: '/country/[cc]', params: { cc: post.countryCode, nm: countryName ?? '' } } as any);
    } catch (err) {
      console.error('[E-2] 게시물 삭제 실패:', err);
      setDeleting(false);
      Alert.alert('삭제하지 못했어요', '다시 시도해주세요.');
    }
  }

  // 댓글 작성 (Q-3). id를 클라이언트에서 만들어 낙관적 항목과 INSERT가 같은 id를
  // 쓰므로 "임시 id → 실제 id" 교체가 필요 없다(compose의 postId와 같은 방식).
  // 성공하면 서버가 돌려준 행으로 교체해 created_at/username을 정확한 값으로 맞춘다.
  // ⚠️ 전송 중 뒤로가기: 응답을 받을 화면이 이미 없으므로 unmountedRef로 setState를
  // 건너뛴다(P-2 flush와 같은 논리 — 떠난 화면엔 원복할 UI가 없다).
  async function handleSubmitComment() {
    if (!userId || !id) return;

    const reason = validateCommentBody(draft);
    if (reason) {
      Alert.alert(
        reason === 'empty' ? '내용을 입력해주세요' : '너무 길어요',
        reason === 'empty' ? '댓글 내용을 적어주세요.' : `댓글은 ${COMMENT_MAX_LENGTH}자까지 쓸 수 있어요.`,
      );
      return;
    }

    const body = draft.trim();
    const newId = Crypto.randomUUID();
    const optimistic: Comment = {
      id: newId,
      userId,
      body,
      createdAt: new Date().toISOString(),
      username: myProfile.username,
      avatarUrl: myProfile.avatarUrl,
    };

    setSubmitting(true);
    setComments((prev) => [...prev, optimistic]);
    setCommentCount((c) => c + 1);
    setDraft('');

    try {
      const saved = await createComment({ id: newId, postId: id, userId, body });
      if (unmountedRef.current) return;
      setComments((prev) => prev.map((c) => (c.id === newId ? saved : c)));
    } catch (err) {
      if (unmountedRef.current) return;
      // 실패 — 낙관적 항목을 걷어내고 입력값을 되돌려준다(다시 쓰게 하지 않음).
      setComments((prev) => prev.filter((c) => c.id !== newId));
      setCommentCount((c) => Math.max(0, c - 1));
      setDraft(body);
      if (err instanceof CommentBodyRejectedError) {
        Alert.alert('댓글을 쓸 수 없어요', err.message);
      } else {
        console.error('[Q-3] 댓글 작성 실패:', err);
        Alert.alert('등록하지 못했어요', '다시 시도해주세요.');
      }
    } finally {
      if (!unmountedRef.current) setSubmitting(false);
    }
  }

  // 댓글 삭제 (Q-3). 비가역이라 확인 다이얼로그를 두고(1단계), 낙관적으로 지우지 않고
  // 성공을 확인한 뒤 목록에서 뺀다 — 실패했는데 사라져 있으면 "지운 줄 알았는데
  // 남아있는" 오해가 생긴다(Phase O의 파괴적 액션 규칙).
  function handleDeleteCommentPress(comment: Comment) {
    Alert.alert('댓글을 삭제할까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDeleteComment(comment) },
    ]);
  }

  async function runDeleteComment(comment: Comment) {
    try {
      const affected = await removeComment(comment.id);
      if (unmountedRef.current) return;
      // ⭐ 0행 자기교정: RLS USING 위반은 에러가 아니라 0행이다. 이미 지워졌거나
      // 내 것이 아니었다는 뜻이므로 에러 배너 대신 조용히 목록에서 정리한다.
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      setCommentCount((c) => Math.max(0, c - 1));
      if (affected === 0) {
        console.warn('[Q-3] 댓글 DELETE 0행 — 이미 삭제됐거나 권한 없음:', comment.id);
      }
    } catch (err) {
      if (unmountedRef.current) return;
      console.error('[Q-3] 댓글 삭제 실패:', err);
      Alert.alert('삭제하지 못했어요', '다시 시도해주세요.');
    }
  }

  // 댓글 영역만 다시 불러온다(전체 재조회가 아니라) — 목록 실패 시 재시도용.
  async function retryComments() {
    if (!id) return;
    setCommentsError(false);
    try {
      const [rows, count] = await Promise.all([listComments(id), getCommentCount(id)]);
      if (unmountedRef.current) return;
      setComments(rows);
      setCommentCount(count);
    } catch (err) {
      if (unmountedRef.current) return;
      console.error('[Q-3] 댓글 재조회 실패:', err);
      setCommentsError(true);
    }
  }

  // P2 공개범위 변경. 나라 색 변경(country/[cc].tsx)과 달리 선택 즉시 화면에
  // 반영하고, 실패하면 이전 값으로 되돌린다(결정 사항 — 낙관적 업데이트 + 원복).
  async function handleVisibilityChange(newVisibility: PostVisibility) {
    if (!id || !post) return;
    setVisibilityPickerOpen(false);
    if (newVisibility === post.visibility) return;

    const prevVisibility = post.visibility;
    setPost({ ...post, visibility: newVisibility });

    const { error } = await supabase.from('posts').update({ visibility: newVisibility }).eq('id', id);

    if (error) {
      console.error('[P2] 공개범위 변경 실패:', error);
      setPost((prev) => (prev ? { ...prev, visibility: prevVisibility } : prev));
      Alert.alert('변경하지 못했어요', '다시 시도해주세요.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 입력창이 키보드에 가리지 않게. iOS는 padding, 안드로이드는 기본
          adjustResize가 처리하므로 behavior를 주지 않는다(다른 화면과 동일 패턴). */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{countryName ?? '기록'}</Text>
        {isOwner ? (
          <Pressable style={styles.iconBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.moreIcon}>···</Text>
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : fetchError ? (
        <View style={styles.centerBody}>
          <ErrorView onRetry={() => setRetryToken((t) => t + 1)} />
        </View>
      ) : notFound || !post ? (
        <View style={styles.centerBody}>
          <Text style={styles.placeholderText}>볼 수 없는 게시물이에요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {mediaLoadError && (
            <Pressable style={styles.mediaErrorRow} onPress={() => setRetryToken((t) => t + 1)}>
              <Text style={styles.mediaErrorText}>사진을 불러오지 못했어요 · 다시 시도</Text>
            </Pressable>
          )}

          {/* 사진 캐러셀 */}
          {photoUrls.length > 0 && (
            <View onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleCarouselScrollEnd}
              >
                {photoUrls.map((url, index) => (
                  <Image
                    key={index}
                    source={{ uri: url }}
                    style={{ width: carouselWidth, height: carouselWidth }}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>

              {photoUrls.length > 1 && (
                <View style={styles.dotsRow}>
                  {photoUrls.map((_, index) => (
                    <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.body}>
            {/* 좋아요 (Phase P-2) — 하트 + 개수. 캐러셀 바로 아래(인스타식 위치). */}
            <Pressable style={styles.likeRow} onPress={onToggleLike} hitSlop={8}>
              <Text style={[styles.heart, pendingLiked && styles.heartActive]}>
                {pendingLiked ? '♥' : '♡'}
              </Text>
              {displayCount > 0 && <Text style={styles.likeCount}>{displayCount}</Text>}
            </Pressable>

            {/* 위치 */}
            <View style={styles.locationSection}>
              <Text style={styles.locationTitle}>{post.placeLabel || countryName || '위치 정보 없음'}</Text>
              {(countryName || post.coord) && (
                <Text style={styles.locationSubtitle}>
                  {countryName}
                  {post.coord ? `  ${post.coord.lat.toFixed(4)}, ${post.coord.lng.toFixed(4)}` : ''}
                </Text>
              )}

              {post.coord && (
                <View style={styles.mapWrap}>
                  <Map
                    style={styles.map}
                    mapStyle={PREVIEW_MAP_STYLE as any}
                    dragPan={false}
                    touchZoom={false}
                    doubleTapZoom={false}
                    doubleTapHoldZoom={false}
                    touchRotate={false}
                    touchPitch={false}
                  >
                    <Camera initialViewState={{ center: [post.coord.lng, post.coord.lat], zoom: 5 }} />
                    <GeoJSONSource id="post-countries" data={countriesGeoJSON as any}>
                      <Layer id="post-country-fill" type="fill" paint={{ 'fill-color': '#CDD2D8', 'fill-opacity': 1 }} />
                      <Layer id="post-country-border" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 0.8 }} />
                    </GeoJSONSource>
                    <Marker lngLat={[post.coord.lng, post.coord.lat]}>
                      <View style={styles.pin} />
                    </Marker>
                  </Map>
                </View>
              )}
            </View>

            {/* 글 */}
            {post.caption && <Text style={styles.caption}>{post.caption}</Text>}

            {/* 메타 */}
            <View style={styles.metaRow}>
              <View style={[styles.visibilityBadge, post.visibility === 'public' && styles.visibilityBadgePublic]}>
                <Text style={[styles.visibilityBadgeText, post.visibility === 'public' && styles.visibilityBadgeTextPublic]}>
                  {VISIBILITY_LABELS[post.visibility]}
                </Text>
              </View>
              <Text style={styles.dateText}>{formatDate(post.takenAt ?? post.createdAt)}</Text>
            </View>

            {/* 댓글 (Phase Q-3) */}
            <View style={styles.commentSection}>
              <Text style={styles.commentHeader}>댓글 {commentCount > 0 ? commentCount : ''}</Text>

              {commentsError ? (
                <ErrorView compact message="댓글을 불러오지 못했어요" onRetry={() => void retryComments()} />
              ) : comments.length === 0 ? (
                <Text style={styles.commentEmpty}>첫 댓글을 남겨보세요</Text>
              ) : (
                <View style={styles.commentList}>
                  {comments.map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      {c.avatarUrl ? (
                        <Image source={{ uri: c.avatarUrl }} style={styles.commentAvatar} />
                      ) : (
                        <View style={[styles.commentAvatar, styles.commentAvatarEmpty]} />
                      )}
                      <View style={styles.commentBubble}>
                        <View style={styles.commentMetaRow}>
                          <Text style={styles.commentAuthor} numberOfLines={1}>
                            @{c.username ?? '알 수 없음'}
                          </Text>
                          <Text style={styles.commentTime}>{formatRelativeTime(c.createdAt)}</Text>
                        </View>
                        <Text style={styles.commentBody}>{c.body}</Text>
                      </View>
                      {c.userId === userId && (
                        <Pressable
                          style={styles.commentDeleteBtn}
                          hitSlop={8}
                          onPress={() => handleDeleteCommentPress(c)}
                        >
                          <Text style={styles.commentDeleteText}>삭제</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}

                  {/* 목록 상한(100)을 넘은 경우 — 개수와 목록이 어긋나는 걸 숨기지 않는다 */}
                  {commentCount > comments.length && (
                    <Text style={styles.commentTruncated}>
                      최근 {comments.length}개만 표시하고 있어요
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* 댓글 입력 — 스크롤 영역 밖에 고정. 게시물을 볼 수 있을 때만 노출한다. */}
      {!loading && !fetchError && !notFound && post && (
        <View style={styles.composerBar}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="댓글 달기..."
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            maxLength={COMMENT_MAX_LENGTH}
            editable={!submitting}
          />
          <Pressable
            style={[styles.composerSend, !canSubmit && styles.composerSendDisabled]}
            disabled={!canSubmit}
            onPress={() => void handleSubmitComment()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.composerSendText}>등록</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* ··· 메뉴 바텀시트 — 본인 게시물에서만 */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.sheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setVisibilityPickerOpen(true);
              }}
            >
              <Text style={styles.menuItemText}>공개범위 변경</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={handleDeletePress}>
              <Text style={styles.menuItemTextDanger}>삭제</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 공개범위 변경 바텀시트 */}
      <Modal
        visible={visibilityPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVisibilityPickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setVisibilityPickerOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>공개범위</Text>
            {post && <VisibilitySelector value={post.visibility} onChange={handleVisibilityChange} />}
          </View>
        </View>
      </Modal>

      {deleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },

  // 댓글
  commentSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 18,
    gap: 12,
  },
  commentHeader: {
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  commentEmpty: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingVertical: 12,
  },
  commentList: {
    gap: 16,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarEmpty: {
    backgroundColor: '#f3f4f6',
  },
  commentBubble: {
    flex: 1,
    gap: 3,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentAuthor: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
  },
  commentTime: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  commentDeleteBtn: {
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  commentDeleteText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  commentTruncated: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingTop: 4,
  },

  // 댓글 입력 바
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  composerInput: {
    flex: 1,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    fontSize: 14,
    fontFamily: theme.fonts.regular,
    color: theme.colors.text,
  },
  composerSend: {
    minWidth: 52,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendDisabled: {
    opacity: 0.4,
  },
  composerSendText: {
    fontSize: 14,
    fontFamily: theme.fonts.bold,
    color: '#fff',
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
  moreIcon: {
    fontSize: 16,
    color: theme.colors.text,
    letterSpacing: -1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  scrollContent: {
    paddingBottom: 40,
  },

  mediaErrorRow: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  mediaErrorText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // 사진 캐러셀
  dotsRow: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 16,
  },

  body: {
    padding: 20,
    gap: 18,
  },

  // 좋아요
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heart: {
    fontSize: 26,
    lineHeight: 30,
    color: theme.colors.textSecondary,
  },
  heartActive: {
    color: '#ff3b30',
  },
  likeCount: {
    fontSize: 15,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
  },

  // 위치
  locationSection: {
    gap: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  locationSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  mapWrap: {
    height: 160,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    marginTop: 4,
  },
  map: {
    flex: 1,
  },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },

  // 글
  caption: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text,
  },

  // 메타
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  visibilityBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  visibilityBadgePublic: {
    backgroundColor: theme.colors.accent,
  },
  visibilityBadgeText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  visibilityBadgeTextPublic: {
    color: '#fff',
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  // ··· 메뉴 바텀시트
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  menuItem: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  menuItemTextDanger: {
    fontSize: 16,
    fontFamily: theme.fonts.bold,
    color: '#ef4444',
  },

  // 삭제 진행 중 오버레이
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
