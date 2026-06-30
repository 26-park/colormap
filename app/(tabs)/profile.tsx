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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

const GRID_GAP = 2;
const NUM_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS;

// 더미 사진 데이터 (실제 게시물 구현 전까지)
const DUMMY_PHOTOS = [
  { id: '1', uri: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400' },
  { id: '2', uri: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400' },
  { id: '3', uri: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400' },
  { id: '4', uri: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400' },
  { id: '5', uri: 'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=400' },
  { id: '6', uri: 'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=400' },
  { id: '7', uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400' },
  { id: '8', uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400' },
  { id: '9', uri: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400' },
];

// 더미 통계
const DUMMY_STATS = {
  countries: 14,
  posts: 214,
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setUsername(data?.username ?? null);
        setLoadingProfile(false);
      });
  }, [session]);

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
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarEmoji}>🌍</Text>
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
          <Text style={styles.bio}>한 도시씩, 색으로 남기는 여행 기록</Text>
        </View>

        {/* 통계 카드 */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{DUMMY_STATS.countries}</Text>
            <Text style={styles.statLabel}>나라</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{DUMMY_STATS.posts}</Text>
            <Text style={styles.statLabel}>게시물</Text>
          </View>
        </View>

        {/* 내 기록 헤더 */}
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>
            내 기록 <Text style={styles.gridCount}>{DUMMY_STATS.posts}</Text>
          </Text>
          <Text style={styles.gridIcon}>⊞</Text>
        </View>

        {/* 사진 그리드 */}
        <View style={styles.grid}>
          {DUMMY_PHOTOS.map((photo, index) => (
            <Pressable key={photo.id} style={styles.cell}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.cellImage}
                resizeMode="cover"
              />
            </Pressable>
          ))}
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

  // 사진 그리드
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
});
