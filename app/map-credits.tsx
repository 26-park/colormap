import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';

/**
 * 지도 데이터 출처 화면 (ODbL 4.3 고지).
 *
 * ⚠️ OpenStreetMap 은 출처표시가 의무이고, Natural Earth 는 퍼블릭 도메인이라
 *    의무가 없다. 그래도 함께 표기한다 — 소스를 바꿔도 UI 를 다시 만들 필요가
 *    없고 표기 누락 리스크가 사라진다(CLAUDE.md "외부 데이터 라이선스 원칙").
 */
const URLS = {
  odbl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  osmCopyright: 'https://www.openstreetmap.org/copyright',
  naturalEarth: 'https://www.naturalearthdata.com/about/terms-of-use/',
  // ⭐ ODbL 4.6 — 가공본(Derivative Database)을 받을 수 있는 경로.
  //    저장소가 public 이라는 사실에 의존한다(CLAUDE.md 차단 조건 참고).
  derivedData: 'https://github.com/26-park/colormap/tree/main/data/kr-sgg',
};

export default function MapCreditsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>지도 데이터 출처</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 시군구 경계 · 해안선 — OpenStreetMap */}
        <Text style={styles.sectionTitle}>시군구 경계 · 해안선</Text>
        <View style={styles.card}>
          <View style={styles.textBlock}>
            <Text style={styles.credit}>지도 데이터 © OpenStreetMap contributors</Text>
            <Text style={styles.caption}>
              Open Database License (ODbL) 1.0 에 따라 이용합니다.
            </Text>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(URLS.odbl)}>
            <Text style={styles.rowText}>ODbL 1.0 라이선스 전문</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(URLS.osmCopyright)}>
            <Text style={styles.rowText}>OpenStreetMap 저작권 안내</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
        </View>

        {/* 나라 경계 — Natural Earth */}
        <Text style={styles.sectionTitle}>나라 경계</Text>
        <View style={styles.card}>
          <View style={styles.textBlock}>
            <Text style={styles.credit}>Made with Natural Earth.</Text>
            <Text style={styles.caption}>퍼블릭 도메인</Text>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(URLS.naturalEarth)}>
            <Text style={styles.rowText}>Natural Earth 이용 약관</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
        </View>

        {/* 가공 데이터 제공 — ODbL 4.6 */}
        <Text style={styles.sectionTitle}>가공 데이터</Text>
        <View style={styles.card}>
          <View style={styles.textBlock}>
            <Text style={styles.caption}>
              이 앱의 경계 데이터는 원본을 단순화하고 해안선에 맞춰 잘라낸 가공본입니다.
              가공본과 가공에 쓴 스크립트는 아래에서 받을 수 있습니다.
            </Text>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => Linking.openURL(URLS.derivedData)}>
            <Text style={styles.rowText}>가공본 내려받기</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
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
    fontSize: 17,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textSecondary,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eef0f3',
    overflow: 'hidden',
  },
  textBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  credit: {
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  rowChevron: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f3f5',
  },
});
