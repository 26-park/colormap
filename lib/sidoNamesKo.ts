// 시군구 → 시도(광역단체) 이름 매핑.
//
// 왜 필요한가: 시군구 이름은 전국에서 중복이 심하다(실측 — 중구 5, 동구 5,
// 서구 4, 북구 4, 남구 4, 강서구 2, 고성군 2). 상세 화면 헤더에 "중구"만 뜨면
// 어디인지 알 수 없으므로 브레드크럼에 시도를 같이 보여준다.
//
// 판정 기준은 sgg_code(행안부 코드) 앞 2자리다. 이름으로 매칭하지 않는다 —
// 위 중복 때문에 이름 매칭은 이 프로젝트에서 금지 원칙이다(Phase S-2의 울산
// 수기 보정도 같은 이유로 osm_id 로 못박았다).

const SIDO_BY_CODE_PREFIX: Record<string, string> = {
  '11': '서울특별시',
  '26': '부산광역시',
  '27': '대구광역시',
  '28': '인천광역시',
  '29': '광주광역시',
  '30': '대전광역시',
  '31': '울산광역시',
  '36': '세종특별자치시',
  '41': '경기도',
  '43': '충청북도',
  '44': '충청남도',
  '46': '전라남도',
  '47': '경상북도',
  '48': '경상남도',
  '50': '제주특별자치도',
  '51': '강원특별자치도',
  '52': '전북특별자치도',
};

// ⚠️ sgg_code 가 없는 예외 — 2026-07-01 인천 개편으로 신설된 4개 구는 행안부
//    코드가 아직 부여되지 않아 sgg_code 가 null 이다(CLAUDE.md Phase S-2 참고).
//    추측한 코드를 넣지 않기로 확정했으므로, 시도 라벨만 osm_relation_id 로
//    직접 못박는다. 코드가 부여되면 이 표에서 지우면 된다.
const SIDO_BY_OSM_ID: Record<number, string> = {
  15864779: '인천광역시', // 검단구
  19416425: '인천광역시', // 서해구
  13349474: '인천광역시', // 영종구
  14550622: '인천광역시', // 제물포구
};

/**
 * 시도 이름을 돌려준다. 판정할 수 없으면 null(호출부가 라벨을 생략한다).
 * sgg_code 가 우선이고, 없을 때만 osm_relation_id 예외표를 본다.
 */
export function getSidoNameKo(
  sggCode: string | null | undefined,
  osmRelationId?: number | null,
): string | null {
  if (sggCode) {
    const sido = SIDO_BY_CODE_PREFIX[sggCode.slice(0, 2)];
    if (sido) return sido;
  }
  if (osmRelationId != null) {
    return SIDO_BY_OSM_ID[osmRelationId] ?? null;
  }
  return null;
}
