import { supabase } from '@/lib/supabase';

export type MapPin = {
  id: string;
  lng: number;
  lat: number;
};

/**
 * 지도에 찍을 내 글의 좌표들.
 *
 * `posts_with_coords` 뷰를 쓴다 — `posts.location` 은 PostGIS geography 라
 * PostgREST 로 WKB 16진수가 내려와 프론트에서 못 읽는다. 이 뷰가 ST_X/ST_Y 로
 * lng/lat 을 미리 계산해 둔다(Phase E). `security_invoker = true` 라 RLS 가
 * 그대로 적용되므로, `user_id` 필터가 없어도 남의 비공개 글은 애초에 안 온다 —
 * 그래도 **명시적으로 내 글만** 거른다(v1 은 내 핀만 표시).
 *
 * ⚠️ 이 뷰에는 `sgg_id` 가 없다(S-3 에서 컬럼을 추가했지만 뷰는 S-1 재생성
 * 시점 목록으로 고정). 핀에는 필요 없지만 나중에 쓰게 되면 뷰를 다시 만들어야
 * 하고, 그때 `security_invoker = true` 유지가 생명이다.
 *
 * 조회 실패는 throw 하지 않고 빈 배열로 끝낸다 — 핀은 지도의 보조 정보라
 * 색칠까지 막을 이유가 없다. 호출부가 콘솔 에러만 남긴다.
 */
export async function fetchMyPins(userId: string): Promise<MapPin[]> {
  const { data, error } = await supabase
    .from('posts_with_coords')
    .select('id, lng, lat')
    .eq('user_id', userId);

  if (error) {
    console.error('지도 핀 조회 실패:', error);
    return [];
  }

  return (data ?? [])
    .filter((row): row is MapPin => typeof row.lng === 'number' && typeof row.lat === 'number')
    .map((row) => ({ id: row.id, lng: row.lng, lat: row.lat }));
}

/** 핀 좌표 목록 → circle 레이어에 물릴 GeoJSON FeatureCollection. */
export function pinsToGeoJSON(pins: MapPin[]) {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      properties: { id: pin.id },
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
    })),
  };
}
