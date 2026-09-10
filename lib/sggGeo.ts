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
