import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { COLOR_PALETTE } from '@/constants/palette';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { resolveMediaUrls } from '@/lib/media';

const GRID_GAP = 1;
const NUM_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;

type GridPost = {
  id: string;
  coverUrl: string | null;
  mediaCount: number;
};

export default function CountryDetailScreen() {
  const { cc, nm } = useLocalSearchParams<{ cc: string; nm: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [color, setColor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  // 그리드 컨테이너의 실제 렌더 폭 — Dimensions.get('window')는 엣지투엣지/시스템바
  // 처리 방식에 따라 실제 렌더 폭과 어긋날 수 있어 onLayout으로 직접 측정한다.
  const [gridWidth, setGridWidth] = useState(SCREEN_WIDTH);
  const cellSize = (gridWidth - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !cc) return;

    supabase
      .from('country_visits')
      .select('color')
      .eq('user_id', userId)
      .eq('country_code', cc)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('country_visits 조회 실패:', error);
          return;
        }
        setColor(data?.color ?? null);
      });
  }, [session?.user.id, cc]);

  // 이 나라(cc)의 게시물 그리드 — visibility 판정은 RLS(posts_select_visible)에 맡기고
  // 여기선 country_code만 필터. post_media를 전부 가져와 order_index 오름차순 정렬 후
  // 맨 앞을 대표사진으로 쓰고, 개수로 '여러장' 배지 여부를 판단한다.
  // 대표사진 url은 시드의 외부 URL이거나 private 버킷 저장 경로일 수 있어, 후처리로
  // resolveMediaUrls(signed URL 배치 발급, 1시간 만료)를 거친 뒤 화면에 반영한다.
  useEffect(() => {
    if (!cc) return;
    setLoadingPosts(true);
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, post_media(url, order_index)')
        .eq('country_code', cc)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('posts 조회 실패:', error);
        if (!cancelled) setLoadingPosts(false);
        return;
      }

      const rows = (data ?? []).map((post) => {
        const media = [...(post.post_media ?? [])].sort((a, b) => a.order_index - b.order_index);
        return { id: post.id, coverUrl: media[0]?.url ?? null, mediaCount: media.length };
      });

      const rawUrls = rows
        .map((row) => row.coverUrl)
        .filter((url): url is string => url !== null);
      const resolved = await resolveMediaUrls(rawUrls);

      if (cancelled) return;
      setPosts(
        rows.map((row) => ({
          ...row,
          coverUrl: row.coverUrl ? resolved[row.coverUrl] ?? null : null,
        })),
      );
      setLoadingPosts(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [cc]);

  async function handleSelectColor(picked: string) {
    const userId = session?.user.id;
    if (!userId || !cc) return;

    const { error } = await supabase
      .from('country_visits')
      .upsert(
        { user_id: userId, country_code: cc, color: picked },
        { onConflict: 'user_id,country_code' },
      );

    if (error) {
      console.error('country_visits 저장 실패:', error);
      return;
    }
    setColor(picked);
    setPaletteOpen(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{nm}</Text>
          <Pressable
            style={[styles.colorDot, color ? { backgroundColor: color } : styles.colorDotEmpty]}
            onPress={() => setPaletteOpen(true)}
          />
        </View>

        <Pressable style={styles.iconBtn}>
          <Text style={styles.moreIcon}>···</Text>
        </Pressable>
      </View>

      {/* 본문 — 게시물 사진 그리드 */}
      <View style={styles.body}>
        {loadingPosts ? (
          <View style={styles.centerBody}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.centerBody}>
            <Text style={styles.placeholderText}>아직 기록이 없어요</Text>
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
                <View key={post.id} style={[styles.cell, { width: cellSize, height: cellSize }]}>
                  {post.coverUrl && (
                    <Image source={{ uri: post.coverUrl }} style={styles.cellImage} resizeMode="cover" />
                  )}
                  {post.mediaCount > 1 && (
                    <View style={styles.multiBadge}>
                      <View style={styles.multiBadgeSquareBack} />
                      <View style={styles.multiBadgeSquareFront} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* 기록 추가 진입점 — 작성 흐름은 나라상세에서만 시작(C-2-3b) */}
      <Pressable
        style={[styles.addFab, { bottom: insets.bottom + 16 }]}
        onPress={() => router.push({ pathname: '/compose', params: { cc, nm } } as any)}
      >
        <Text style={styles.addFabPlus}>+</Text>
        <Text style={styles.addFabText}>기록 추가</Text>
      </Pressable>

      {/* 색 팔레트 바텀시트 — v1: 고정 8색만 (컬러휠/hex는 v1.2 유료) */}
      <Modal
        visible={paletteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaletteOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPaletteOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>나라 색 선택</Text>
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
    fontWeight: '700',
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
    paddingBottom: 96,
  },
  countLabel: {
    fontSize: 14,
    fontWeight: '700',
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

  // 기록 추가 FAB
  addFab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  addFabPlus: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
  },
  addFabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
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
    fontWeight: '700',
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
