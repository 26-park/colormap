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
