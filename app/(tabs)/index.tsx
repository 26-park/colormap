import { useCallback, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import countriesGeoJSON from '@/assets/geo/countries.json';

// Phase 1: 인라인 스타일 JSON — 외부 타일 없음. Phase 2에서 Tintrail 커스텀 스타일로 교체
const MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#EBF1F7' },
    },
  ],
};

const DEFAULT_GREY = '#CDD2D8'; // 미방문 나라 기본색

// 나라별 색을 매핑하는 fill-color match 표현식 빌더
function buildFillColor(visited: Record<string, string>) {
  const entries = Object.entries(visited);
  if (entries.length === 0) return DEFAULT_GREY; // match는 case가 0개면 invalid
  return [
    'match',
    ['get', 'cc'],
    ...entries.flatMap(([cc, color]) => [cc, color]),
    DEFAULT_GREY,
  ];
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const [visitedMap, setVisitedMap] = useState<Record<string, string>>({});
  const [colorLoadError, setColorLoadError] = useState(false);

  // 지도 탭이 포커스될 때마다 재조회 — 나라상세에서 색 바꾸고 돌아오면 즉시 반영.
  // 재조회 중에도 기존 visitedMap을 유지하다 새 데이터 도착 시 교체(깜빡임 없음).
  // 지도 자체는 실패해도 정상 렌더되므로(그냥 색칠이 비는 것) 전체를 덮는 에러 UI
  // 대신 방해되지 않는 작은 배너로만 안내한다.
  const loadVisited = useCallback(() => {
    const userId = session?.user.id;
    if (!userId) return;

    setColorLoadError(false);
    supabase
      .from('country_visits')
      .select('country_code, color')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) {
          console.error('country_visits 조회 실패:', error);
          setColorLoadError(true);
          return;
        }
        const map: Record<string, string> = {};
        for (const row of data ?? []) {
          map[row.country_code] = row.color;
        }
        setVisitedMap(map);
      });
  }, [session?.user.id]);

  useFocusEffect(loadVisited);

  function handleCountryPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const feature = event.nativeEvent.features[0];
    const cc = feature?.properties?.cc;
    const nm = feature?.properties?.nm;
    if (!cc) return; // 바다 / 코드 없는 지점(Siachen 등) 무시

    router.push({ pathname: '/country/[cc]', params: { cc, nm } } as any);
  }

  return (
    <View style={styles.container}>
      {/* 지도 — 컨테이너 전체를 채움 */}
      <Map
        style={StyleSheet.absoluteFillObject}
        mapStyle={MAP_STYLE as any} // TODO: StyleSpecification 타입으로 교체
      >
        <Camera
          initialViewState={{ center: [0, 20], zoom: 1 }}
        />
        {/* 색칠은 feature-state가 아니라 fill-color match(['get','cc'])로 처리 —
            promoteId는 설치된 v11.3.6 GeoJSONSourceProps에 없어 넣어도 무시된다 (CLAUDE.md 참고) */}
        <GeoJSONSource
          id="countries"
          data={countriesGeoJSON as any} // TODO: FeatureCollection 타입으로 교체
          onPress={handleCountryPress}
        >
          <Layer
            id="country-fill"
            type="fill"
            paint={{ 'fill-color': buildFillColor(visitedMap) as any, 'fill-opacity': 1 }}
          />
          <Layer
            id="country-border"
            type="line"
            paint={{ 'line-color': '#FFFFFF', 'line-width': 0.8 }}
          />
        </GeoJSONSource>
      </Map>

      {/* ── 상단 헤더 오버레이 ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.logo}>Tintrail</Text>

          {/* 평면지도/지구본 정적 토글 — 지구본 전환 기능은 다음 Phase */}
          <View style={styles.togglePill}>
            <View style={[styles.toggleOption, styles.toggleOptionActive]}>
              <Text style={[styles.toggleText, styles.toggleTextActive]}>평면지도</Text>
            </View>
            <View style={styles.toggleOption}>
              <Text style={styles.toggleText}>지구본</Text>
            </View>
          </View>

          {/* 아바타 플레이스홀더 */}
          <View style={styles.avatar} />
        </View>

        {colorLoadError && (
          <TouchableOpacity style={styles.colorErrorBanner} onPress={loadVisited}>
            <Text style={styles.colorErrorBannerText}>색칠 정보를 불러오지 못했어요 · 다시 시도</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 우측 줌 버튼 (정적 — 기능은 다음 Phase) ── */}
      <View style={styles.zoomContainer}>
        <TouchableOpacity style={styles.zoomBtn}>
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity style={styles.zoomBtn}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF1F7',
  },

  // ── 헤더 ──
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  logo: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.accent,
    letterSpacing: -0.3,
  },
  colorErrorBanner: {
    marginTop: 8,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(220,38,38,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  colorErrorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.error,
  },

  // 토글 필
  togglePill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    padding: 3,
  },
  toggleOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  toggleOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  toggleTextActive: {
    color: theme.colors.text,
    fontWeight: '600',
  },

  // 아바타
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
  },

  // ── 줌 버튼 ──
  zoomContainer: {
    position: 'absolute',
    right: 16,
    top: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    fontSize: 22,
    color: theme.colors.text,
    fontWeight: '400',
    lineHeight: 26,
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginHorizontal: 8,
  },
});
