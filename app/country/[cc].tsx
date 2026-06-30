import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { COLOR_PALETTE } from '@/constants/palette';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';

export default function CountryDetailScreen() {
  const { cc, nm } = useLocalSearchParams<{ cc: string; nm: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [color, setColor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

      {/* 본문 — 사진/게시물 그리드는 다음 Phase */}
      <View style={styles.body}>
        <Text style={styles.placeholderText}>여기에 게시물/사진이 들어올 자리</Text>
      </View>

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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
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
