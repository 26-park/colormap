import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';
import { COLOR_PALETTE } from '@/constants/palette';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { resolveMediaUrls } from '@/lib/media';
import { getSidoNameKo } from '@/lib/sidoNamesKo';
import { ErrorView } from '@/components/ErrorView';

// Phase S-6a/S-6b: 시군구 상세.
//
// ⭐ 라우트 키가 osm_id(= sgg.osm_relation_id)인 이유: 지도가 탭 순간 손에 쥐는
//    값이 렌더 GeoJSON 의 properties.osm_id 뿐이라, uuid 로 라우팅하려면 push 전에
//    네트워크 왕복이 생겨 탭 반응이 늦어진다. 색칠 바인딩(S-5c)과 경계 갱신
//    매칭 키도 이미 osm_relation_id 라 일관성도 맞는다.
//    sgg_code 는 인천 신설 4개 구가 null 이라 라우트 키로 쓸 수 없다.
//
// 화면 안에서 쓰는 실제 참조 키는 sgg.id(uuid)다 — posts.sgg_id / sgg_visits.sgg_id
// 가 그걸 가리킨다. 그래서 진입 직후 osm_relation_id → 행 단건 조회로 uuid 를 얻고,
// 이후 쿼리(그리드 / S-6c 색 선택)는 전부 uuid 로 나간다.

const GRID_GAP = 1;
const NUM_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;

type SggRow = {
  id: string;
  osm_relation_id: number;
  sgg_code: string | null;
  name: string;
};

type GridPost = {
  id: string;
  coverUrl: string | null;
  mediaCount: number;
};

export default function SggDetailScreen() {
  const { osmId, name } = useLocalSearchParams<{ osmId: string; name?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [sgg, setSgg] = useState<SggRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 조회는 됐는데 행이 없는 경우 — 경계 갱신으로 relation 이 사라진 뒤 남은
  // 딥링크 등. 에러(재시도)와 구분해서 안내한다.
  const [notFound, setNotFound] = useState(false);

  // S-6c 색칠 — 나라상세 G-2 패턴을 그대로 옮긴 것.
  // ⭐ 앱은 색칠을 생성하지 않는다(S-4 트리거가 한다). 이미 있는 행의 color 만 바꾼다.
  const [color, setColor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // 팔레트 잠금 판정 전용 — 탭 상태와 무관하게 항상 "내 게시물 수"만 센다
  // ("모두" 탭을 보고 있어도 잠금은 정확해야 한다).
  const [myPostCount, setMyPostCount] = useState<number | null>(null);
  // 조회 실패 시 myPostCount 는 이전 값(초기 null)을 유지해 fail-closed 로 잠긴 채
  // 남는다 — 이 플래그는 "정말 기록이 없어서 잠김"과 "확인 실패로 잠김"을 구분해
  // 힌트 문구와 재시도를 다르게 보여주기 위한 것.
  const [myPostCountError, setMyPostCountError] = useState(false);
  const [lockHintVisible, setLockHintVisible] = useState(false);
  const [lockHintText, setLockHintText] = useState('');
  const lockHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canColor = myPostCount !== null && myPostCount > 0;

  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine');
  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState(false);
  // 최초 1회만 로딩 스피너를 보여주고, 이후 포커스 재조회는 기존 그리드를 유지한
  // 채 백그라운드로 갱신한다(깜빡임 방지) — 탭 전환도 동일하게 취급.
  const loadedPostsOnceRef = useRef(false);
  // 탭 전환/재포커스가 겹칠 때 늦게 도착한 이전 응답이 최신 응답을 덮어쓰지
  // 않도록 하는 토큰(나라상세·프로필 D-2와 동일 패턴).
  const requestIdRef = useRef(0);
  // 그리드 컨테이너의 실제 렌더 폭 — Dimensions.get('window')는 엣지투엣지 처리
  // 방식에 따라 실제 렌더 폭과 어긋날 수 있어 onLayout으로 직접 측정한다.
  const [gridWidth, setGridWidth] = useState(SCREEN_WIDTH);
  const cellSize = (gridWidth - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

  // 경계는 정적 참조 데이터라 포커스마다 다시 볼 필요가 없다(useFocusEffect 아님).
  // 게시물처럼 바뀌는 것만 아래에서 useFocusEffect 로 붙인다.
  const loadSgg = useCallback(() => {
    const relationId = Number(osmId);
    if (!Number.isFinite(relationId)) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    setLoading(true);
    setError(false);
    setNotFound(false);

    supabase
      .from('sgg')
      .select('id, osm_relation_id, sgg_code, name')
      .eq('osm_relation_id', relationId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) {
          console.error('sgg 조회 실패:', err);
          setError(true);
          return;
        }
        if (!data) {
          setNotFound(true);
          return;
        }
        setSgg(data as SggRow);
      });
  }, [osmId]);

  useEffect(loadSgg, [loadSgg]);

  // 이 시군구(sgg.id)의 게시물 그리드 — 나라상세의 country_code 필터를 sgg_id 로
  // 바꾼 것 외에는 같다. "내 기록"이면 user_id 도 필터, "모두"면 무필터(RLS의
  // posts_select_visible = can_view_post 가 가시성을 판정한다).
  //
  // useFocusEffect 는 콜백 identity 가 바뀌면 focus 상태에서도 즉시 재실행되므로
  // (@react-navigation/core), activeTab 을 의존성에 넣는 것만으로 탭 전환 재조회가
  // 된다. sggId 도 의존성이라 경계 조회가 끝나는 순간 자동으로 첫 로드가 돈다.
  const sggId = sgg?.id;
  const loadPosts = useCallback(() => {
    const userId = session?.user.id;
    if (!sggId) return;
    if (activeTab === 'mine' && !userId) return;
    if (!loadedPostsOnceRef.current) setLoadingPosts(true);
    setPostsError(false);

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    (async () => {
      let query = supabase
        .from('posts')
        .select('id, post_media(url, order_index)')
        .eq('sgg_id', sggId)
        .order('created_at', { ascending: false });
      if (activeTab === 'mine') query = query.eq('user_id', userId);

      const { data, error: err } = await query;

      if (requestId !== requestIdRef.current) return;
      if (err) {
        console.error('posts 조회 실패:', err);
        setLoadingPosts(false);
        setPostsError(true);
        return;
      }

      const rows = (data ?? []).map((post) => {
        const media = [...(post.post_media ?? [])].sort((a, b) => a.order_index - b.order_index);
        return { id: post.id, coverUrl: media[0]?.url ?? null, mediaCount: media.length };
      });

      // 대표사진 url 은 시드의 외부 URL 이거나 private 버킷 저장 경로일 수 있어
      // signed URL 배치 발급(1시간)을 거친 뒤 화면에 반영한다.
      const rawUrls = rows
        .map((row) => row.coverUrl)
        .filter((url): url is string => url !== null);
      const resolved = await resolveMediaUrls(rawUrls);

      if (requestId !== requestIdRef.current) return;
      setPosts(
        rows.map((row) => ({
          ...row,
          coverUrl: row.coverUrl ? resolved[row.coverUrl] ?? null : null,
        })),
      );
      setLoadingPosts(false);
      loadedPostsOnceRef.current = true;
    })();
  }, [sggId, activeTab, session?.user.id]);

  useFocusEffect(loadPosts);

  // 현재 색 — 포커스마다 재조회한다. S-4 트리거가 게시물 유무에 따라 행을 만들거나
  // 지우므로, 게시물 상세에서 삭제하고 돌아오면 색 동그라미 상태도 같이 바뀐다.
  useFocusEffect(
    useCallback(() => {
      const userId = session?.user.id;
      if (!userId || !sggId) return;

      supabase
        .from('sgg_visits')
        .select('color')
        .eq('user_id', userId)
        .eq('sgg_id', sggId)
        .maybeSingle()
        .then(({ data, error: err }) => {
          if (err) {
            console.error('sgg_visits 조회 실패:', err);
            return;
          }
          setColor(data?.color ?? null);
        });
    }, [session?.user.id, sggId]),
  );

  // 잠금 판정 — head: true 라 행 페이로드 없이 개수만 센다.
  // posts_sgg_idx(sgg_id, user_id) 가 이 조건에 그대로 맞는다.
  const loadMyPostCount = useCallback(() => {
    const userId = session?.user.id;
    if (!userId || !sggId) return;

    setMyPostCountError(false);
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('sgg_id', sggId)
      .eq('user_id', userId)
      .then(({ count, error: err }) => {
        if (err) {
          console.error('내 게시물 수 조회 실패:', err);
          setMyPostCountError(true);
          return;
        }
        setMyPostCount(count ?? 0);
      });
  }, [session?.user.id, sggId]);

  useFocusEffect(loadMyPostCount);

  useEffect(() => {
    return () => {
      if (lockHintTimerRef.current) clearTimeout(lockHintTimerRef.current);
    };
  }, []);

  function showLockHint(text: string) {
    setLockHintText(text);
    setLockHintVisible(true);
    if (lockHintTimerRef.current) clearTimeout(lockHintTimerRef.current);
    lockHintTimerRef.current = setTimeout(() => setLockHintVisible(false), 2000);
  }

  function handleColorDotPress() {
    if (myPostCountError) {
      showLockHint('잠금 상태를 확인하지 못했어요 · 탭해서 다시 시도');
      loadMyPostCount();
      return;
    }
    if (!canColor) {
      showLockHint('이 지역에 기록을 추가하면 색칠돼요');
      return;
    }
    setPaletteOpen(true);
  }

  // S-4 트리거가 sgg_visits 행 생성/삭제를 전담 — 앱은 기존 행의 color 만
  // UPDATE 한다(INSERT/upsert 경로 없음). canColor 가 true 면 트리거가 행을
  // 보장하지만, RLS USING 위반은 에러가 아니라 조용한 0행으로 끝나므로
  // .select() 로 영향 행 수를 반드시 확인한다 — 0행을 성공으로 취급하지 않는다.
  async function handleSelectColor(picked: string) {
    const userId = session?.user.id;
    if (!userId || !sggId) return;

    const { data, error: err } = await supabase
      .from('sgg_visits')
      .update({ color: picked })
      .eq('user_id', userId)
      .eq('sgg_id', sggId)
      .select('color');

    if (err) {
      console.error('sgg_visits 저장 실패:', err);
      return;
    }
    if (!data || data.length === 0) {
      console.warn('sgg_visits 행이 없어 색을 변경하지 못했습니다:', sggId);
      return;
    }
    setColor(picked);
    setPaletteOpen(false);
  }

  // 헤더는 지도에서 넘겨받은 이름으로 즉시 그리고, 조회가 끝나면 DB 값으로 교체한다
  // (나라상세가 nm 파라미터를 쓰는 것과 같은 패턴).
  const title = sgg?.name ?? name ?? '';
  const sido = getSidoNameKo(sgg?.sgg_code, sgg?.osm_relation_id);
  // 세종특별자치시는 시도이면서 그 자체가 하나의 경계라 라벨이 이름과 같아진다 —
  // "대한민국 · 세종특별자치시 / 세종특별자치시"로 두 번 나오지 않게 생략한다.
  const showSido = sido !== null && sido !== title;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {/* 경계를 아직 모르면(uuid 없음) 색 조회·변경 자체가 불가능하므로 숨긴다 */}
          {sgg && (
            <Pressable
              style={[
                styles.colorDot,
                canColor
                  ? (color ? { backgroundColor: color } : styles.colorDotEmpty)
                  : styles.colorDotLocked,
              ]}
              onPress={handleColorDotPress}
            />
          )}
        </View>

        {/* 헤더 좌우 균형용 — 나라상세의 ···(no-op)는 여기 두지 않는다 */}
        <View style={styles.iconBtn} />

        {lockHintVisible && (
          <View style={styles.lockHintWrap} pointerEvents="none">
            <Text style={styles.lockHintText}>{lockHintText}</Text>
          </View>
        )}
      </View>

      {/* 브레드크럼 — 줌 6 이상에서는 지도에서 나라(KR)를 탭할 방법이 사실상
          없다(한국 내륙은 시군구 레이어가 덮고, 나라 히트는 해안선 22dp 이내뿐).
          그래서 나라상세로 올라가는 길을 여기에 명시적으로 둔다. */}
      <View style={styles.breadcrumbRow}>
        <Pressable
          onPress={() => router.push({ pathname: '/country/[cc]', params: { cc: 'KR' } } as any)}
          hitSlop={8}
        >
          <Text style={styles.breadcrumbLink}>대한민국</Text>
        </Pressable>
        {showSido && <Text style={styles.breadcrumbSep}> · {sido}</Text>}
      </View>

      {/* 내 기록 / 모두 탭 — 경계(uuid)를 모르면 조회 자체가 불가능하므로 그때는
          띄우지 않는다(눌러도 아무 일도 안 하는 탭을 만들지 않기 위함). */}
      {sgg && (
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, activeTab === 'mine' && styles.tabSelected]}
            onPress={() => setActiveTab('mine')}
          >
            <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextSelected]}>내 기록</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'all' && styles.tabSelected]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextSelected]}>모두</Text>
          </Pressable>
        </View>
      )}

      {/* 본문 — 색 선택은 S-6c 에서 붙인다. */}
      <View style={styles.body}>
        {loading ? (
          <View style={styles.centerBody}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.centerBody}>
            <ErrorView message="지역 정보를 불러오지 못했어요" onRetry={loadSgg} />
          </View>
        ) : notFound ? (
          <View style={styles.centerBody}>
            <Text style={styles.placeholderText}>존재하지 않는 지역이에요</Text>
          </View>
        ) : loadingPosts ? (
          <View style={styles.centerBody}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : postsError ? (
          <View style={styles.centerBody}>
            <ErrorView onRetry={loadPosts} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.centerBody}>
            <Text style={styles.placeholderText}>
              {activeTab === 'mine' ? '아직 이 지역에 남긴 기록이 없어요' : '아직 게시물이 없어요'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.countLabel}>
              기록 <Text style={styles.countNumber}>{posts.length}</Text>
            </Text>
            <View
              style={styles.grid}
              onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
            >
              {posts.map((post) => (
                <Pressable
                  key={post.id}
                  style={[styles.cell, { width: cellSize, height: cellSize }]}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } } as any)}
                >
                  {post.coverUrl && (
                    <Image source={{ uri: post.coverUrl }} style={styles.cellImage} resizeMode="cover" />
                  )}
                  {post.mediaCount > 1 && (
                    <View style={styles.multiBadge}>
                      <View style={styles.multiBadgeSquareBack} />
                      <View style={styles.multiBadgeSquareFront} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* 색 팔레트 바텀시트 — v1: 고정 8색만 (컬러휠/hex는 v1.2 유료).
          ⚠️ 나라상세(app/country/[cc].tsx)와 같은 시트가 두 곳에 있다 —
          ColorPaletteSheet 추출은 백로그(CLAUDE.md 알려진 갭). */}
      <Modal
        visible={paletteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaletteOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPaletteOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>지역 색 선택</Text>
            <View style={styles.swatchRow}>
              {COLOR_PALETTE.map((swatch) => (
                <Pressable
                  key={swatch}
                  style={[styles.swatchWrapper, swatch === color && styles.swatchWrapperSelected]}
                  onPress={() => handleSelectColor(swatch)}
                >
                  <View style={[styles.swatch, { backgroundColor: swatch }]} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
    position: 'relative', // lockHintWrap(absolute) 기준
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: theme.colors.text,
    lineHeight: 24,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
    textAlign: 'center',
  },

  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  colorDotEmpty: {
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  colorDotLocked: {
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    opacity: 0.5,
  },
  lockHintWrap: {
    position: 'absolute',
    top: '100%',
    left: 16,
    right: 16,
    marginTop: 4,
    alignItems: 'center',
  },
  lockHintText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    color: '#fff',
    // 나라상세보다 진하게 — 여기는 힌트가 브레드크럼 줄 위에 겹치므로
    // 반투명이면 아래 글자가 비쳐 보인다.
    backgroundColor: 'rgba(0,0,0,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },

  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  breadcrumbLink: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.accent,
  },
  breadcrumbSep: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // 내 기록 / 모두 탭 (나라상세와 동일 스펙)
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  tabSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  tabTextSelected: {
    color: '#fff',
  },

  body: {
    flex: 1,
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
    paddingBottom: 32,
  },
  countLabel: {
    fontSize: 14,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  countNumber: {
    color: theme.colors.accent,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cell: {
    backgroundColor: '#f3f4f6',
    position: 'relative',
    overflow: 'hidden',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  multiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
  },
  multiBadgeSquareBack: {
    position: 'absolute',
    top: 0,
    left: 4,
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  multiBadgeSquareFront: {
    position: 'absolute',
    top: 4,
    left: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  // 색 팔레트 바텀시트
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
    paddingTop: 20,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 18,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  swatchWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchWrapperSelected: {
    borderColor: theme.colors.text,
  },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
});
