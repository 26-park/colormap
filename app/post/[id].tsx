import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Map, Camera, Marker, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { resolveMediaUrls } from '@/lib/media';
import { deletePost, type PostVisibility } from '@/lib/posts';
import { getCountryName } from '@/lib/countryFromCoord';
import { useAuth } from '@/context/auth';
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

const VISIBILITY_LABELS: Record<PostVisibility, string> = {
  public: '전체공개',
  friends: '친구공개',
  private: '비공개',
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

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [carouselWidth, setCarouselWidth] = useState(SCREEN_WIDTH);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    (async () => {
      // RLS(posts_select_visible)가 가시성을 강제하므로 쿼리는 id 필터만 건다.
      // 결과가 없으면 삭제됐거나 볼 수 없는 게시물 — 둘 다 같은 안내로 처리.
      // posts.location(geography)은 그대로 select하면 WKB 16진수라 파싱이 안 돼서
      // posts_with_coords 뷰(ST_X/ST_Y로 lng/lat 미리 계산, Phase E)를 대신 조회한다.
      const { data, error } = await supabase
        .from('posts_with_coords')
        .select('user_id, caption, place_label, visibility, created_at, taken_at, country_code, lng, lat')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[Phase E] 게시물 조회 실패:', error);
      }
      if (error || !data) {
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
      }

      const rawUrls = (mediaRows ?? []).map((m) => m.url);
      const resolved = await resolveMediaUrls(rawUrls);

      if (cancelled) return;
      setPhotoUrls(rawUrls.map((u) => resolved[u]).filter((u): u is string => !!u));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleCarouselScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (carouselWidth === 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    setActiveIndex(index);
  }

  const countryName = post ? getCountryName(post.countryCode) : null;
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
      ) : notFound || !post ? (
        <View style={styles.centerBody}>
          <Text style={styles.placeholderText}>볼 수 없는 게시물이에요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          </View>
        </ScrollView>
      )}

      {/* ··· 메뉴 바텀시트 — 본인 게시물에서만 (지금은 삭제 하나뿐) */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.sheet}>
            <Pressable style={styles.menuItem} onPress={handleDeletePress}>
              <Text style={styles.menuItemTextDanger}>삭제</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {deleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
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
  moreIcon: {
    fontSize: 16,
    color: theme.colors.text,
    letterSpacing: -1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
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

  // 위치
  locationSection: {
    gap: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '700',
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
    fontWeight: '600',
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
  menuItem: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  menuItemTextDanger: {
    fontSize: 16,
    fontWeight: '700',
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
