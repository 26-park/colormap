import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { resolveMediaUrls } from '@/lib/media';
import { theme } from '@/constants/theme';

const GRID_GAP = 1;
const NUM_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;

type GridPost = {
  id: string;
  coverUrl: string | null;
  mediaCount: number;
};

type Stats = {
  countries: number;
  posts: number;
  friends: number;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const [stats, setStats] = useState<Stats>({ countries: 0, posts: 0, friends: 0 });

  const [posts, setPosts] = useState<GridPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  // 나라상세(app/country/[cc].tsx)와 동일한 이유로 Dimensions.get 대신 onLayout 실측 폭 사용.
  const [gridWidth, setGridWidth] = useState(SCREEN_WIDTH);
  const cellSize = (gridWidth - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

  // 프로필 (username, avatar_url, bio)
  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('username, avatar_url, bio')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setUsername(data?.username ?? null);
        setAvatarUrl(data?.avatar_url ?? null);
        setBio(data?.bio ?? null);
        setLoadingProfile(false);
      });
  }, [session]);

  // 통계 3개 — count만 가볍게 조회(head: true). friends는 지금 항상 0
  // (v1.1 친구 기능 붙으면 자동으로 채워짐).
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

    (async () => {
      const [countriesRes, postsRes, friendsRes] = await Promise.all([
        supabase
          .from('country_visits')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('friendships')
          .select('user_low', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`user_low.eq.${userId},user_high.eq.${userId}`),
      ]);

      setStats({
        countries: countriesRes.count ?? 0,
        posts: postsRes.count ?? 0,
        friends: friendsRes.count ?? 0,
      });
    })();
  }, [session?.user.id]);

  // 내 게시물 전체 그리드 — app/country/[cc].tsx와 동일 패턴(대표사진 order_index 최소,
  // 여러장 배지, resolveMediaUrls 배치 signed URL), country_code 대신 user_id로 필터.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    setLoadingPosts(true);
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, post_media(url, order_index)')
        .eq('user_id', userId)
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
  }, [session?.user.id]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Pressable style={styles.settingsBtn} onPress={handleSignOut} disabled={signingOut}>
            {signingOut
              ? <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              : <Text style={styles.settingsIcon}>⚙️</Text>
            }
          </Pressable>
        </View>

        {/* 프로필 영역 */}
        <View style={styles.profileSection}>
          {/* TODO: 프로필 편집(아바타 업로드/소개 수정)은 별도 단계 */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
                : <Text style={styles.avatarEmoji}>🌍</Text>
              }
            </View>
          </View>

          {loadingProfile
            ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 12 }} />
            : (
              <Text style={styles.username}>
                @{username ?? session?.user.email?.split('@')[0] ?? 'user'}
              </Text>
            )
          }
          {bio ? <Text style={styles.bio}>{bio}</Text> : null}
        </View>

        {/* 통계 카드 */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.countries}</Text>
            <Text style={styles.statLabel}>나라</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.posts}</Text>
            <Text style={styles.statLabel}>기록</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.friends}</Text>
            <Text style={styles.statLabel}>친구</Text>
          </View>
        </View>

        {/* 내 기록 헤더 */}
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>
            내 기록 <Text style={styles.gridCount}>{stats.posts}</Text>
          </Text>
          <Text style={styles.gridIcon}>⊞</Text>
        </View>

        {/* 사진 그리드 */}
        {loadingPosts ? (
          <View style={styles.centerBody}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.centerBody}>
            <Text style={styles.placeholderText}>아직 기록이 없어요</Text>
          </View>
        ) : (
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
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerSpacer: {
    width: 36,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },

  // 프로필
  profileSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 24,
  },
  avatarWrapper: {
    padding: 3,
    borderRadius: 56,
    borderWidth: 2.5,
    borderColor: theme.colors.accent,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEmoji: {
    fontSize: 44,
  },
  username: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  bio: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.textSecondary,
    paddingHorizontal: 32,
    textAlign: 'center',
  },

  // 통계
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    paddingVertical: 18,
    borderRadius: theme.radius.card,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.accent,
    lineHeight: 34,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: theme.colors.border,
  },

  // 그리드 헤더
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  gridCount: {
    color: theme.colors.accent,
  },
  gridIcon: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },

  // 빈 상태 / 로딩
  centerBody: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // 사진 그리드
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
});
