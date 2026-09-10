import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import sggGeoJSON from '@/data/kr-sgg/sgg_kr_render.json';

// MapLibre v11의 LngLatBounds 형식 — [west, south, east, north].
// (types/LngLatBounds.d.ts: "south-west and north-east corners in flat style per GeoJSON RFC")
export type SggBounds = [number, number, number, number];

type Ring = number[][];

function ringsOf(geometry: any): Ring[] {
  // Polygon = 링 배열 / MultiPolygon = 폴리곤 배열의 링 배열.
  // 홀(내부 구멍)은 외곽 링 안에 있으므로 bbox에 영향이 없어 그냥 전부 훑는다.
  if (geometry.type === 'Polygon') return geometry.coordinates as Ring[];
  return (geometry.coordinates as Ring[][]).flat();
}

/**
 * 시군구 하나를 화면에 담을 bbox를 돌려준다. 없으면 null.
 *
 * 렌더용 GeoJSON(`sgg_kr_render.json`)에서 계산한다 — 지도 탭이 이미 같은 모듈을
 * import 하므로 번들에 한 번만 들어가고, 추가 데이터 파일이나 재생성이 필요 없다.
 *
 * ⭐ 고정 줌 대신 bbox 를 쓰는 이유: 시군구 크기가 74배까지 차이난다
 * (대구 중구 경도폭 0.026° vs 옹진군 1.928°). 고정 줌이면 한쪽은 화면을
 * 벗어나고 한쪽은 점이 된다.
 *
 * ⚠️ 군도(옹진군·신안군 등 10개)는 bbox 가 섬 전체를 감싸서 육지가 작게 보인다
 * (bbox/육지 면적비가 옹진군 100배). 이건 오동작이 아니라 실제 관할 범위이고,
 * "가장 큰 섬에 맞추기" 같은 추측은 틀렸을 때 사용자가 한참 팬하게 만들어서 더
 * 나쁘다. 전체를 보여주고 사용자가 핀치로 좁히는 쪽을 택했다.
 * ⚠️ padding 을 키우면 지도가 그만큼 더 축소되므로 이 문제가 악화된다 — 최소로 줄 것.
 */
export function getSggBounds(osmId: number): SggBounds | null {
  if (!Number.isFinite(osmId)) return null;

  const feature = (sggGeoJSON as any).features.find(
    (f: any) => f.properties?.osm_id === osmId,
  );
  if (!feature) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const ring of ringsOf(feature.geometry)) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  return [west, south, east, north];
}

export type SggHit = {
  osmId: number;
  name: string;
};

/**
 * 탭 좌표를 실제로 포함하는 시군구를 찾는다. 없으면 null(바다·국경 밖).
 *
 * ⭐⭐ 왜 필요한가 — 오탭의 진짜 원인은 히트박스 "크기"가 아니라 `features[0]`을
 * 그대로 쓴 것이다. 네이티브는 탭 지점 기준 **44×44dp 사각형**으로 질의하고
 * (MLRNPressableSource.kt `DEFAULT_HITBOX = RectF(22,22,22,22)`), 줌 4에서는
 * 시군구 하나가 약 9.6dp라 **한 번 탭에 20개 이상이 후보로 들어온다.** 그 순서를
 * 우리가 정하지 않으므로 엉뚱한 시군구가 열렸다(충주시를 노렸는데 정선군).
 * `hitbox` 는 공개 GeoJSONSource props 에 노출돼 있지 않아 JS 에서 줄일 수도 없다.
 *
 * 대신 `PressEvent.lngLat`(탭 지점)으로 직접 판정하면 히트박스와 무관하게 정확해진다.
 * `lib/countryFromCoord.ts` 의 `getCountryFromCoord` 와 **같은 패턴**이다.
 *
 * ⚠️ **오탭이 0이 되지는 않는다** — "누른 곳이 아닌 데가 열리는 것"을 없앨 뿐,
 * 9.6dp 목표를 손가락으로 정확히 누르는 어려움은 그대로다. 실기기에서 여전히
 * 답답하면 그때 SGG_MIN_ZOOM 을 5로 올리는 것을 검토한다.
 *
 * ⚠️ 화면에 그려지는 것과 같은 **렌더본**(해안선 클립 + 3% 단순화)으로 판정한다 —
 * 사용자가 본 도형과 판정 도형이 어긋나지 않게 하기 위함이다(원본 미클립이 아니다).
 */
export function findSggAtPoint(lng: number, lat: number): SggHit | null {
  const pt = point([lng, lat]);
  for (const feature of (sggGeoJSON as any).features) {
    if (booleanPointInPolygon(pt, feature.geometry)) {
      return { osmId: feature.properties.osm_id, name: feature.properties.name };
    }
  }
  return null;
}
