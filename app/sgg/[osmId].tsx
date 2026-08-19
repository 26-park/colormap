import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { getSidoNameKo } from '@/lib/sidoNamesKo';
import { ErrorView } from '@/components/ErrorView';

// Phase S-6a: 시군구 상세 뼈대.
//
// ⭐ 라우트 키가 osm_id(= sgg.osm_relation_id)인 이유: 지도가 탭 순간 손에 쥐는
//    값이 렌더 GeoJSON 의 properties.osm_id 뿐이라, uuid 로 라우팅하려면 push 전에
//    네트워크 왕복이 생겨 탭 반응이 늦어진다. 색칠 바인딩(S-5c)과 경계 갱신
//    매칭 키도 이미 osm_relation_id 라 일관성도 맞는다.
//    sgg_code 는 인천 신설 4개 구가 null 이라 라우트 키로 쓸 수 없다.
//
// 화면 안에서 쓰는 실제 참조 키는 sgg.id(uuid)다 — posts.sgg_id / sgg_visits.sgg_id
// 가 그걸 가리킨다. 그래서 진입 직후 osm_relation_id → 행 단건 조회로 uuid 를 얻고,
// 이후 쿼리(S-6b 그리드 / S-6c 색 선택)는 전부 uuid 로 나간다.

type SggRow = {
  id: string;
  osm_relation_id: number;
  sgg_code: string | null;
  name: string;
};

export default function SggDetailScreen() {
  const { osmId, name } = useLocalSearchParams<{ osmId: string; name?: string }>();
  const router = useRouter();
  const [sgg, setSgg] = useState<SggRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 조회는 됐는데 행이 없는 경우 — 경계 갱신으로 relation 이 사라진 뒤 남은
  // 딥링크 등. 에러(재시도)와 구분해서 안내한다.
  const [notFound, setNotFound] = useState(false);

  // 경계는 정적 참조 데이터라 포커스마다 다시 볼 필요가 없다(useFocusEffect 아님).
  // 게시물·색칠처럼 바뀌는 것들은 다음 단계에서 useFocusEffect 로 붙인다.
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
        </View>

        {/* 헤더 좌우 균형용 — 나라상세의 ···(no-op)는 여기 두지 않는다 */}
        <View style={styles.iconBtn} />
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

      {/* 본문 — 게시물 그리드는 S-6b, 색 선택은 S-6c 에서 붙인다. */}
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
        ) : null}
      </View>
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
});
