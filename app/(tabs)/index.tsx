import { useCallback, useRef, useState } from 'react';
import { Image, StyleSheet, View, TouchableOpacity, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type MapRef,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { Text } from '@/components/AppText';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import countriesGeoJSON from '@/assets/geo/countries.json';
// 렌더링용 시군구 경계 — 해안선 클립 + 3% 단순화본(718KB). 판정용 미클립 원본과
// 별개 파일이다. 출처/라이선스는 data/kr-sgg/README.md 참고 (OSM, ODbL 1.0).
import sggGeoJSON from '@/data/kr-sgg/sgg_kr_render.json';
// 시군구 라벨 앵커 — 피처당 점 1개(data/kr-sgg/make_labels.py로 생성).
// 경계 폴리곤에 직접 symbol을 물리면 MultiPolygon 파트마다 라벨이 붙어
// 섬이 많은 시군구에서 이름이 여러 번 나온다(여수시 6개, 통영시 7개 실측).
import sggLabelGeoJSON from '@/data/kr-sgg/sgg_kr_labels.json';

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

// S-5b: 시군구 레이어가 나타나는 줌 임계값.
// 이 값 미만 = 나라 단위(KR도 한 덩어리로 칠함) / 이 값 이상 = 시군구 단위.
// country-fill-kr 의 maxzoom 과 sgg 레이어들의 minzoom 에 같은 값을 써서
// 정확히 교대시킨다 — 둘이 겹쳐 칠해지면 색이 섞인다.
const SGG_MIN_ZOOM = 6;

// 줌 버튼 동작 범위. 최소값은 초기 세계뷰(zoom 1)와 맞춘다 — 이보다 더 빼면
// 지도가 화면보다 작아져 빈 배경만 늘어난다.
const MIN_ZOOM = 0;
const MAX_ZOOM = 16;
const INITIAL_ZOOM = 0;
const ZOOM_STEP = 1;
const ZOOM_ANIM_MS = 300;

// 한국지도 버튼이 이동할 위치. zoom은 SGG_MIN_ZOOM 이상이어야 시군구가 보인다.
// center는 제주(33.1°)부터 최북단(38.6°)까지 들어오도록 남한 가운데로 잡았다.
const KOREA_VIEW = { center: [127.8, 36.0] as [number, number], zoom: 6.2 };
const KOREA_FLY_MS = 900;

// 시군구 라벨. 경계(SGG_MIN_ZOOM)보다 늦게 등장시켜, 멀리서는 색만 보이고
// 가까이 가면 이름이 붙게 한다. 크기는 줌으로 보간한다.
const SGG_LABEL_MIN_ZOOM = 6;
const SGG_LABEL_SIZE = ['interpolate', ['linear'], ['zoom'], 6, 9, 11, 15];
// glyphs 없는 스타일이라 로컬 폰트 이름으로 해석된다. 안드로이드에서 한글이
// 확실히 있는 시스템 폰트를 앞에 두고, 없으면 뒤로 폴백한다.
const SGG_LABEL_FONT = ['Noto Sans CJK KR', 'Roboto', 'sans-serif'];

// 시군구 색 매핑. 나라와 같은 match 구조지만 키가 osm_id(숫자)다.
// ⭐ sgg_code 를 키로 쓰면 안 된다 — 2026-07 신설된 인천 4개 구는 코드가 아직
//    null 이라 영영 색칠되지 않는다. osm_id 는 230개 전부 갖고 있다.
function buildSggFillColor(visited: Record<number, string>) {
  const entries = Object.entries(visited);
  if (entries.length === 0) return DEFAULT_GREY;
  return [
    'match',
    ['get', 'osm_id'],
    ...entries.flatMap(([osmId, color]) => [Number(osmId), color]),
    DEFAULT_GREY,
  ];
}

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
  const [sggVisitedMap, setSggVisitedMap] = useState<Record<number, string>>({});
  const [colorLoadError, setColorLoadError] = useState(false);

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  // 버튼 비활성 판정용. 이동이 끝날 때만 갱신되므로 애니메이션 도중 값은 아니다.
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // 연타 대비 — 진행 중인 애니메이션의 "목표" 줌. 이게 없으면 두 번째 탭이
  // 아직 안 끝난 첫 애니메이션의 중간값을 기준으로 계산해 한 단계를 까먹는다.
  const targetZoomRef = useRef<number | null>(null);

  // 한국지도 버튼 — 시군구가 보이는 줌으로 이동한다.
  // targetZoomRef를 같이 갱신해야 이동 직후 +/− 버튼이 중간값을 읽지 않는다.
  const handleGoKorea = useCallback(() => {
    targetZoomRef.current = KOREA_VIEW.zoom;
    setZoom(KOREA_VIEW.zoom);
    cameraRef.current?.flyTo({
      center: KOREA_VIEW.center,
      zoom: KOREA_VIEW.zoom,
      duration: KOREA_FLY_MS,
    });
  }, []);

  const handleZoomBy = useCallback(async (delta: number) => {
    const current = targetZoomRef.current ?? (await mapRef.current?.getZoom()) ?? zoom;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta));
    if (next === current) return; // 한계 도달 — 무반응(크래시 없음)
    targetZoomRef.current = next;
    cameraRef.current?.zoomTo(next, { duration: ZOOM_ANIM_MS });
  }, [zoom]);

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

  // 시군구 색칠. country_visits 와 같은 패턴이되 sgg 를 조인해 osm_relation_id 를
  // 받아온다 — 렌더링 GeoJSON 의 osm_id 와 이걸로 맞춘다.
  // 조용한 실패 금지: 실패하면 기존 배너(colorLoadError)를 그대로 쓴다.
  const loadSggVisited = useCallback(() => {
    const userId = session?.user.id;
    if (!userId) return;

    supabase
      .from('sgg_visits')
      .select('color, sgg(osm_relation_id)')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) {
          console.error('sgg_visits 조회 실패:', error);
          setColorLoadError(true);
          return;
        }
        const map: Record<number, string> = {};
        for (const row of (data ?? []) as any[]) {
          // PostgREST 는 임베드를 객체로도 배열로도 돌려준다(Phase Q-3 와 같은 함정).
          const embedded = Array.isArray(row.sgg) ? row.sgg[0] : row.sgg;
          const osmId = embedded?.osm_relation_id;
          if (osmId != null) map[Number(osmId)] = row.color;
        }
        setSggVisitedMap(map);
      });
  }, [session?.user.id]);

  const loadAllVisited = useCallback(() => {
    loadVisited();
    loadSggVisited();
  }, [loadVisited, loadSggVisited]);

  useFocusEffect(loadAllVisited);

  function handleCountryPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const feature = event.nativeEvent.features[0];
    const cc = feature?.properties?.cc;
    const nm = feature?.properties?.nm;
    if (!cc) return; // 바다 / 코드 없는 지점(Siachen 등) 무시

    router.push({ pathname: '/country/[cc]', params: { cc, nm } } as any);
  }

  // S-6a: 시군구 탭 → 시군구 상세.
  // ⭐ 줌 분기를 따로 계산하지 않는다 — 네이티브가 소스별로
  //    queryRenderedFeatures(터치점, 그 소스의 레이어들)를 돌리므로(MLRNMapView.kt),
  //    minzoom/maxzoom 으로 꺼진 레이어는 애초에 후보가 아니다. 즉 SGG_MIN_ZOOM
  //    미만에서는 이 핸들러가 아예 불리지 않고 countries 가 처리한다.
  //    두 소스가 동시에 히트하면(해안선 근처 — country-border 는 줌 제한이 없다)
  //    스타일에서 더 위에 있는 레이어를 가진 소스가 이긴다 = sgg. 바다 쪽을 찍어
  //    sgg 가 안 잡히면 countries 만 남아 /country/KR 로 가는 폴백이 된다.
  function handleSggPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const feature = event.nativeEvent.features[0];
    const osmId = feature?.properties?.osm_id;
    const name = feature?.properties?.name;
    if (osmId == null) return;

    router.push({ pathname: '/sgg/[osmId]', params: { osmId: String(osmId), name } } as any);
  }

  return (
    <View style={styles.container}>
      {/* 지도 — 컨테이너 전체를 채움 */}
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        mapStyle={MAP_STYLE as any} // TODO: StyleSpecification 타입으로 교체
        // ⭐ 실기기에서 "한국지도 버튼 뒤에 검은 동그라미"로 보고된 것의 정체는
        //    MapLibre 기본 나침반이다. compassHiddenFacingNorth 기본값이 true라
        //    평소엔 숨어 있다가 지도가 북쪽을 안 볼 때(=회전했을 때) 우상단에
        //    나타난다 — 핀치 줌 중에 두 손가락이 살짝 돌아가면 쉽게 회전된다.
        //    에뮬레이터 마우스 조작으로는 회전이 잘 일어나지 않아 못 봤던 것.
        // 색칠 지도는 북쪽 고정이 자연스러우므로 회전·기울임 자체를 끈다
        // (회전된 채로는 한국이 비스듬히 보여 읽기도 어렵다).
        compass={false}
        touchRotate={false}
        touchPitch={false}
        onRegionDidChange={(e) => {
          // 제스처로 움직였을 수도 있으므로 실제값 기준으로 목표를 리셋한다.
          setZoom(e.nativeEvent.zoom);
          targetZoomRef.current = null;
        }}
      >
        <Camera
          ref={cameraRef}
          // ⭐ 첫 화면은 "세계지도"가 아니라 "내가 칠한 지도"다. 줌 0에서도 경도가
          //    다 들어오지 않으므로(월드 512dp vs 화면 411dp) 중심을 어디에 두느냐가
          //    무엇이 보이는지를 정한다 — 아시아 중심이면 색칠된 나라 대부분이
          //    첫 화면에 들어온다(경도 0 중심이면 한 곳도 안 들어온다).
          initialViewState={{ center: [100, 15], zoom: INITIAL_ZOOM }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
        />
        {/* 색칠은 feature-state가 아니라 fill-color match(['get','cc'])로 처리 —
            promoteId는 설치된 v11.3.6 GeoJSONSourceProps에 없어 넣어도 무시된다 (CLAUDE.md 참고) */}
        <GeoJSONSource
          id="countries"
          data={countriesGeoJSON as any} // TODO: FeatureCollection 타입으로 교체
          onPress={handleCountryPress}
        >
          {/* 한국 외 나라 — 줌과 무관하게 항상 나라 단위로 칠한다 */}
          <Layer
            id="country-fill"
            type="fill"
            filter={['!=', ['get', 'cc'], 'KR'] as any}
            paint={{ 'fill-color': buildFillColor(visitedMap) as any, 'fill-opacity': 1 }}
          />
          {/* 한국만 분리 — SGG_MIN_ZOOM 부터는 시군구 레이어가 대신 칠하므로 여기서 끝난다 */}
          <Layer
            id="country-fill-kr"
            type="fill"
            filter={['==', ['get', 'cc'], 'KR'] as any}
            maxzoom={SGG_MIN_ZOOM}
            paint={{ 'fill-color': buildFillColor(visitedMap) as any, 'fill-opacity': 1 }}
          />
          <Layer
            id="country-border"
            type="line"
            paint={{ 'line-color': '#FFFFFF', 'line-width': 0.8 }}
          />
        </GeoJSONSource>

        {/* 시군구 — countries 소스 뒤에 오므로 위에 그려진다. */}
        <GeoJSONSource id="sgg" data={sggGeoJSON as any} onPress={handleSggPress}>
          <Layer
            id="sgg-fill"
            type="fill"
            minzoom={SGG_MIN_ZOOM}
            paint={{ 'fill-color': buildSggFillColor(sggVisitedMap) as any, 'fill-opacity': 1 }}
          />
          <Layer
            id="sgg-line"
            type="line"
            minzoom={SGG_MIN_ZOOM}
            paint={{ 'line-color': '#FFFFFF', 'line-width': 0.6 }}
          />
        </GeoJSONSource>

        {/* 시군구 이름 라벨 — 경계와 별도 소스(피처당 점 1개).
            ⭐ 스타일에 glyphs 가 없으면 text-font 는 "로컬 시스템 폰트 이름
               목록"으로 해석된다(MapLibre 사양) — 그래서 글리프 서버 없이
               한글이 렌더된다. 타일 벤더가 없는 이 프로젝트에 딱 맞는다.
            ⭐ 겹침 처리는 MapLibre 기본 동작에 맡긴다(text-allow-overlap 기본
               false) — 자리가 없으면 알아서 숨고 확대하면 다시 나타난다.
               별도 로직 불필요.
            onPress 를 주지 않아 탭은 이 소스를 통과해 아래 폴리곤이 받는다. */}
        <GeoJSONSource id="sgg-labels" data={sggLabelGeoJSON as any}>
          <Layer
            id="sgg-label"
            type="symbol"
            minzoom={SGG_LABEL_MIN_ZOOM}
            layout={{
              'text-field': ['get', 'name'] as any,
              'text-font': SGG_LABEL_FONT,
              'text-size': SGG_LABEL_SIZE as any,
              'text-padding': 2,
            }}
            paint={{
              'text-color': '#4A5058',
              'text-halo-color': 'rgba(255,255,255,0.9)',
              'text-halo-width': 1.2,
            }}
          />
        </GeoJSONSource>
      </Map>

      {/* ── 상단 헤더 오버레이 ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          {/* ⭐ 로고는 텍스트가 아니라 이미지다.
              안드로이드에서 Pretendard 텍스트의 측정 폭이 실제 글리프보다 좁게
              잡혀 마지막 글자가 잘렸다("Tintrail" → "Tintrai"/"Tintra").
              letterSpacing 제거 → flexShrink+paddingRight → allowFontScaling=false
              로 세 번 대응했지만 실기기에서 계속 재발했다. 이미지는 측정이
              개입하지 않아 모든 기기에서 픽셀이 같다.
              에셋 생성: scripts/make-logo.py (Pretendard-Bold 20dp, accent 색) */}
          <Image
            source={require('@/assets/images/logo-wordmark.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Tintrail"
          />

          {/* 한국지도 바로가기 — 시군구가 보이는 줌으로 날아간다.
              (이 자리에 있던 평면지도/지구본 토글은 삭제했다 — 지구본은
               백로그로 내려간 기능이라 동작하지 않는 껍데기였다.) */}
          <TouchableOpacity
            style={styles.koreaBtn}
            onPress={handleGoKorea}
            accessibilityLabel="한국지도로 이동"
          >
            <Text style={styles.koreaBtnText} allowFontScaling={false}>한국지도</Text>
          </TouchableOpacity>
        </View>

        {colorLoadError && (
          <TouchableOpacity style={styles.colorErrorBanner} onPress={loadVisited}>
            <Text style={styles.colorErrorBannerText}>색칠 정보를 불러오지 못했어요 · 다시 시도</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 우측 줌 버튼 ── */}
      <View style={styles.zoomContainer}>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => void handleZoomBy(ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          accessibilityLabel="확대"
        >
          <Text style={[styles.zoomBtnText, zoom >= MAX_ZOOM && styles.zoomBtnTextDisabled]}>
            +
          </Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => void handleZoomBy(-ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          accessibilityLabel="축소"
        >
          <Text style={[styles.zoomBtnText, zoom <= MIN_ZOOM && styles.zoomBtnTextDisabled]}>
            −
          </Text>
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
  // scripts/make-logo.py가 뽑은 1x 크기(70x20dp). 에셋을 다시 만들면
  // 스크립트가 출력하는 1x 크기로 이 값을 맞출 것.
  logo: {
    width: 70,
    height: 20,
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
    fontFamily: theme.fonts.semibold,
    color: theme.colors.error,
  },

  // 한국지도 바로가기 버튼
  koreaBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  koreaBtnText: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.text,
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
    fontFamily: theme.fonts.regular,
    lineHeight: 26,
  },
  zoomBtnTextDisabled: {
    opacity: 0.3,
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginHorizontal: 8,
  },
});
