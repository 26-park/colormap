import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import countriesGeoJSON from '@/assets/geo/countries.json';

export type CountryMatch = {
  cc: string;
  nm: string;
};

type CountryFeature = Feature<Polygon | MultiPolygon, { cc: string; nm: string }>;

const countries = countriesGeoJSON as unknown as { features: CountryFeature[] };

// 좌표 → countries.json(Natural Earth) point-in-polygon 판정으로 나라(cc/nm) 파생.
// ⚠️ turf는 [lng, lat] 순서 — 이 함수도 동일하게 lng, lat 순서로 받는다.
export function getCountryFromCoord(lng: number, lat: number): CountryMatch | null {
  const pt = point([lng, lat]);
  for (const feature of countries.features) {
    if (booleanPointInPolygon(pt, feature.geometry)) {
      return { cc: feature.properties.cc, nm: feature.properties.nm };
    }
  }
  return null;
}

// cc → 대략적인 중심 좌표(외곽 링 정점 평균, 면적 가중 아님) — 작성 화면 미니맵을
// 진입 나라 쪽으로 카메라 이동시키는 용도(C-2-3b)일 뿐, 정밀 지오코딩 대체 아님.
// 같은 cc가 여러 피처로 중복되는 나라(SO/CY/AU 등)는 첫 매치만 사용.
export function getCountryCentroid(cc: string): [number, number] | null {
  const feature = countries.features.find((f) => f.properties.cc === cc);
  if (!feature) return null;

  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;

  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const rings of polygons) {
    const outerRing = rings[0]; // 홀(내부 구멍)은 카메라 프레이밍용이라 무시
    for (const [x, y] of outerRing) {
      sumX += x;
      sumY += y;
      count++;
    }
  }

  return count === 0 ? null : [sumX / count, sumY / count];
}

// cc → 나라 이름(nm). 같은 cc가 여러 피처로 중복되는 나라(SO/CY/AU 등)는 첫 매치만 사용.
export function getCountryName(cc: string): string | null {
  return countries.features.find((f) => f.properties.cc === cc)?.properties.nm ?? null;
}
