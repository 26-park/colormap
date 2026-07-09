import { theme } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { resolveMediaUrls } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GRID_GAP = 1;
const NUM_COLS = 3;
const SCREEN_WIDTH = Dimensions.get("window").width;
// 페이지당 개수. 무한스크롤 검증 시 게시물이 적으면 이 값만 3 등으로 임시로
// 낮춰서 확인하고, 끝나면 30으로 되돌릴 것.
const PAGE_SIZE = 30;

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
  const userId = session?.user.id;

  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // 통계 3개 — 필터에 영향받지 않는 전체 기준
  const [stats, setStats] = useState<Stats>({
    countries: 0,
    posts: 0,
    friends: 0,
  });

  // 나라 필터 칩 + 정렬
  const [chips, setChips] = useState<string[]>([]);
  const [selectedCc, setSelectedCc] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false); // 기본 최신순
  const [filteredCount, setFilteredCount] = useState(0);

  // 그리드 페이지네이션
  const [posts, setPosts] = useState<GridPost[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // 나라상세(app/country/[cc].tsx)와 동일한 이유로 Dimensions.get 대신 onLayout 실측 폭 사용.
  const [gridWidth, setGridWidth] = useState(SCREEN_WIDTH);
  const cellSize = (gridWidth - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

  // requestId: 필터/정렬이 바뀐 뒤 늦게 도착한 이전 요청 응답을 무시하기 위한 토큰.
  // loadingRef: onEndReached 중복 호출(같은 프레임에서 여러 번 발생 가능) 동기 가드.
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  // 프로필 (username, avatar_url, bio)
  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("username, avatar_url, bio")
      .eq("id", session.user.id)
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
    if (!userId) return;

    (async () => {
      const [countriesRes, postsRes, friendsRes] = await Promise.all([
        supabase
          .from("country_visits")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("friendships")
          .select("user_low", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`user_low.eq.${userId},user_high.eq.${userId}`),
      ]);

      setStats({
        countries: countriesRes.count ?? 0,
        posts: postsRes.count ?? 0,
        friends: friendsRes.count ?? 0,
      });
    })();
  }, [userId]);

  // 나라 필터 칩 목록 — 내가 기록을 올린 나라만 (my_post_countries RPC)
  useEffect(() => {
    if (!userId) return;
    supabase.rpc("my_post_countries").then(({ data, error }) => {
      if (error) {
        console.error("my_post_countries 조회 실패:", error);
        return;
      }
      setChips(
        (data ?? []).map((row: { country_code: string }) => row.country_code),
      );
    });
  }, [userId]);

  // 필터된 개수(그리드 헤더 "내 기록 N") — 통계 카드의 전체 기록 수(stats.posts)와는
  // 별개로, 현재 선택된 나라 필터와 동일한 조건으로 가볍게 다시 센다.
  useEffect(() => {
    if (!userId) return;

    (async () => {
      let query = supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (selectedCc) query = query.eq("country_code", selectedCc);

      const { count } = await query;
      setFilteredCount(count ?? 0);
    })();
  }, [userId, selectedCc]);

  // 한 페이지(PAGE_SIZE개) 조회 — 대표사진(order_index 최소) 추출 후, 이번에 새로
  // 받은 대표사진만 resolveMediaUrls로 signed URL 발급(전체 일괄발급 방지).
  const loadPage = useCallback(
    async (
      pageIndex: number,
      cc: string | null,
      asc: boolean,
      requestId: number,
    ) => {
      if (!userId) return;

      let query = supabase
        .from("posts")
        .select("id, post_media(url, order_index)")
        .eq("user_id", userId)
        .order("created_at", { ascending: asc })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);
      if (cc) query = query.eq("country_code", cc);

      const { data, error } = await query;

      // 그새 필터/정렬이 바뀌어 새 요청이 시작됐다면 이 응답은 버린다.
      if (requestId !== requestIdRef.current) {
        loadingRef.current = false;
        return;
      }
      if (error) {
        console.error("posts 페이지 조회 실패:", error);
        if (pageIndex === 0) setLoadingPosts(false);
        else setLoadingMore(false);
        loadingRef.current = false;
        return;
      }

      const rows = (data ?? []).map((post) => {
        const media = [...(post.post_media ?? [])].sort(
          (a, b) => a.order_index - b.order_index,
        );
        return {
          id: post.id,
          coverUrl: media[0]?.url ?? null,
          mediaCount: media.length,
        };
      });

      const rawUrls = rows
        .map((row) => row.coverUrl)
        .filter((url): url is string => url !== null);
      const resolved = await resolveMediaUrls(rawUrls);

      if (requestId !== requestIdRef.current) {
        loadingRef.current = false;
        return;
      }

      const resolvedRows = rows.map((row) => ({
        ...row,
        coverUrl: row.coverUrl ? (resolved[row.coverUrl] ?? null) : null,
      }));

      setPosts((prev) =>
        pageIndex === 0 ? resolvedRows : [...prev, ...resolvedRows],
      );
      setHasMore(rows.length === PAGE_SIZE);
      setPage(pageIndex);
      if (pageIndex === 0) setLoadingPosts(false);
      else setLoadingMore(false);
      loadingRef.current = false;
    },
    [userId],
  );

  // 필터/정렬이 바뀌면 처음부터 다시 로드
  useEffect(() => {
    if (!userId) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    loadingRef.current = true;
    setPosts([]);
    setHasMore(true);
    setLoadingMore(false);
    setLoadingPosts(true);

    loadPage(0, selectedCc, sortAsc, requestId);
  }, [userId, selectedCc, sortAsc, loadPage]);

  const handleEndReached = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    loadPage(page + 1, selectedCc, sortAsc, requestIdRef.current);
  }, [hasMore, page, selectedCc, sortAsc, loadPage]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  const listHeader = (
    <View>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Pressable
          style={styles.settingsBtn}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.textSecondary}
            />
          ) : (
            <Text style={styles.settingsIcon}>⚙️</Text>
          )}
        </Pressable>
      </View>

      {/* 프로필 영역 */}
      <View style={styles.profileSection}>
        {/* TODO: 프로필 편집(아바타 업로드/소개 수정)은 별도 단계 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarEmoji}>🌍</Text>
            )}
          </View>
        </View>

        {loadingProfile ? (
          <ActivityIndicator
            color={theme.colors.accent}
            style={{ marginTop: 12 }}
          />
        ) : (
          <Text style={styles.username}>
            @{username ?? session?.user.email?.split("@")[0] ?? "user"}
          </Text>
        )}
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      </View>

      {/* 통계 카드 — 필터와 무관하게 항상 전체 기준 */}
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

      {/* 나라 필터 칩 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        <Pressable
          style={[styles.chip, selectedCc === null && styles.chipSelected]}
          onPress={() => setSelectedCc(null)}
        >
          <Text
            style={[
              styles.chipText,
              selectedCc === null && styles.chipTextSelected,
            ]}
          >
            전체
          </Text>
        </Pressable>
        {chips.map((cc) => (
          <Pressable
            key={cc}
            style={[styles.chip, selectedCc === cc && styles.chipSelected]}
            onPress={() => setSelectedCc(cc)}
          >
            <Text
              style={[
                styles.chipText,
                selectedCc === cc && styles.chipTextSelected,
              ]}
            >
              {cc}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 정렬 토글 */}
      <View style={styles.sortRow}>
        <Pressable onPress={() => setSortAsc((prev) => !prev)}>
          <Text style={styles.sortText}>
            {sortAsc ? "오래된순" : "최신순"} ↕
          </Text>
        </Pressable>
      </View>

      {/* 내 기록 헤더 — 현재 필터 기준 개수(전체 통계의 기록 수와 다를 수 있음, 정상) */}
      <View style={styles.gridHeader}>
        <Text style={styles.gridTitle}>
          내 기록 <Text style={styles.gridCount}>{filteredCount}</Text>
        </Text>
        <Text style={styles.gridIcon}>⊞</Text>
      </View>
    </View>
  );

  const listEmpty = loadingPosts ? (
    <View style={styles.centerBody}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  ) : (
    <View style={styles.centerBody}>
      <Text style={styles.placeholderText}>
        {selectedCc ? "이 나라엔 기록이 없어요" : "아직 기록이 없어요"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        style={styles.scroll}
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.cell, { width: cellSize, height: cellSize }]}
            onPress={() =>
              router.push({
                pathname: "/post/[id]",
                params: { id: item.id },
              } as any)
            }
          >
            {item.coverUrl && (
              <Image
                source={{ uri: item.coverUrl }}
                style={styles.cellImage}
                resizeMode="cover"
              />
            )}
            {item.mediaCount > 1 && (
              <View style={styles.multiBadge}>
                <View style={styles.multiBadgeSquareBack} />
                <View style={styles.multiBadgeSquareFront} />
              </View>
            )}
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={theme.colors.accent}
              style={styles.footerSpinner}
            />
          ) : null
        }
      />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsIcon: {
    fontSize: 18,
  },

  // 프로필
  profileSection: {
    alignItems: "center",
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
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarEmoji: {
    fontSize: 44,
  },
  username: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  bio: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.textSecondary,
    paddingHorizontal: 32,
    textAlign: "center",
  },

  // 통계
  statsCard: {
    flexDirection: "row",
    marginHorizontal: 20,
    paddingVertical: 18,
    borderRadius: theme.radius.card,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
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

  // 나라 필터 칩
  chipRow: {
    marginBottom: 12,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  chipSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: "#fff",
  },

  // 정렬 토글
  sortRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  // 그리드 헤더
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: "700",
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  footerSpinner: {
    paddingVertical: 20,
  },

  // 사진 그리드
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  cell: {
    backgroundColor: "#f3f4f6",
    position: "relative",
    overflow: "hidden",
  },
  cellImage: {
    width: "100%",
    height: "100%",
  },
  multiBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 14,
    height: 14,
  },
  multiBadgeSquareBack: {
    position: "absolute",
    top: 0,
    left: 4,
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  multiBadgeSquareFront: {
    position: "absolute",
    top: 4,
    left: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
});
