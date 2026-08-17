# 한국 시군구 경계 데이터 (Phase S)

## 출처 및 라이선스

이 디렉터리의 경계 데이터는 **OpenStreetMap**에서 추출·가공한 것이다.

> 지도 데이터 © OpenStreetMap contributors
> Open Database License (ODbL) v1.0 — https://opendatacommons.org/licenses/odbl/1-0/
> https://www.openstreetmap.org/copyright

- **원본**: OpenStreetMap (Overpass API)
- **추출일**: 2026-08-17 (OSM 스냅샷 `osm_base = 2026-08-17T04:xx:xxZ`)
- **가공 내용**: 관계(relation) 멤버 way를 링으로 조립 → GeoJSON(MultiPolygon) 변환,
  울산 5개 시군구의 행정구역코드 수기 보정, 렌더링용 사본은 좌표 단순화.
  → 이 가공물은 ODbL상 **Derivative Database**에 해당한다.

## ODbL 준수 방법 (중요)

이 저장소에 가공된 경계 파일을 **원본 형태 그대로 커밋해 두는 것**으로
ODbL 4.2(고지)와 4.6(파생 DB 접근 제공)을 동시에 충족한다.

- **4.2 (Notices)** — 이 README에 ODbL URI와 저작권 고지를 둔다.
- **4.6 (Access to Derivative Databases)** — 파생 DB(= 이 디렉터리의 GeoJSON)를
  기계판독 형태로 **무상** 제공한다. 저장소가 공개되어 있으므로 이 조건이 충족된다.

### ⛔ 이 충족은 "저장소가 public"이라는 조건에 전적으로 의존한다

저장소를 **private으로 전환하면 그 즉시 ODbL 4.6 위반**이 된다. 앱(Produced Work)을
배포하는 한, 파생 DB를 받을 수 있는 공개 경로를 반드시 따로 마련해야 한다.
**저장소 공개범위를 바꾸는 작업을 할 때는 이 항목을 먼저 확인할 것.**

### 앱 내 출처표시

ODbL 4.3에 따라 앱(Produced Work)에도 출처를 표시한다.
**설정 → "지도 데이터 출처"** 화면에 다음을 노출한다 (구현: Phase S-5/S-6).

```
지도 데이터 © OpenStreetMap contributors, ODbL 1.0
https://www.openstreetmap.org/copyright
```

### 사용자 게시물은 share-alike 대상이 아니다

게시물(`posts`)은 경계 테이블을 **surrogate id로 참조만** 하고 OSM 콘텐츠를 담지
않는다. OSMF **Collective Database Guideline**상 이 경우 우리 데이터는 독립적인
것으로 취급되어 share-alike가 적용되지 않는다.

⚠️ 단, 같은 가이드라인은 "중복 제거하며 병합"하는 경우를 반례로 든다.
**`posts`에 OSM 속성값(시군구 이름 등)을 복사해 넣으면 이 보호가 깨질 수 있다.
FK만 두는 설계를 유지할 것.**

## 파일

| 파일 | 용도 | 크기 |
|---|---|---|
| `sgg_kr_raw.geojson` | **판정용 원본** (미단순화, 미클립). PostGIS 적재본의 소스 | 7.3MB |
| `sgg_kr_simplified10.geojson` | **렌더링용** 10% 단순화본. 아직 해안선 미클립 | 629KB |
| `extract.py` | 추출 재현 스크립트 | — |

### 속성

| 키 | 설명 |
|---|---|
| `osm_id` | OSM relation id. **갱신 시 매칭 키** |
| `name` | 시군구 이름. ⚠️ 중복이 많다(중구 5, 동구 5, 서구 4…) — 자연키로 쓰지 말 것 |
| `sgg_code` | 행정안전부 코드 5자리. **인천 신설 4개는 `null`** (아래 참고) |
| `mois_admin` | 같은 코드 10자리 원본 |
| `admin_level` | 6 (시군구) 또는 4 (세종) |
| `code_source` | `osm` = OSM 태그 그대로 / `manual` = 수기 보정 / `null` = 결측 |

## 구성 — 230개

```
230 = 시 77 + 군 82 + 구 70 (admin_level=6, 229개)
    + 세종특별자치시 (admin_level=4, 1개)
```

⚠️ **`admin_level=6`이 229개로 표준 시군구 개수와 같지만 구성이 다르다.**
표준 229는 `226 자치 + 제주 행정시 2 + 세종 1`인데, 여기서는
`227 자치(2026-07-01 인천 개편 반영) + 제주 행정시 2`이고 **세종이 없다.**
그래서 세종을 `admin_level=4`에서 따로 가져와 병합한다.
**개수 일치를 검증으로 삼지 말 것.**

## 알려진 특성 / 주의사항

- **⚠️ 해상 경계를 포함한다.** 전체 면적 합이 179,728km²로 남한 국토(약 100,400km²)의
  1.8배다. 내륙 시군구는 실측치와 일치하지만(부산진구 29.5 / 실제 29.7km²) 연안은
  바다까지 뻗는다(군산시 4,162 / 육지 396km²).
  → **판정용은 미클립 유지**(해변·선상 좌표가 NULL이 되지 않게), **렌더링용만 클립**한다.
- **미세 파트는 실제 월경지다.** 부산진구 조각이 동구 안에, 군산시 조각 2개가 부안군
  안에 있다(400~11,400m²). 단순화하면 사라진다(파트 240→235) — 버그가 아니다.
- **인천 신설 4개(제물포·영종·서해·검단)는 `sgg_code`가 `null`이다.** 2026-07-01
  개편으로 신설돼 MOIS 고시 코드를 아직 확인하지 못했다.
  [행정표준코드관리시스템](https://www.code.go.kr/stdcode/regCodeL.do)에서 확인 후 채울 것.
  **추측한 코드를 넣지 말 것 — 틀린 코드가 `null`보다 나쁘다.**
- **울산 5개는 수기 보정분**(`code_source='manual'`)이다. 갱신 시 OSM에 코드가
  붙었는지 재확인할 것.

## 재현

```bash
cd data/kr-sgg
python extract.py                 # 수집 -> 스냅샷 검사 -> 조립 -> sgg_kr_raw.geojson
npx mapshaper sgg_kr_raw.geojson -simplify visvalingam 10% keep-shapes \
    -o precision=0.00001 format=geojson sgg_kr_simplified10.geojson
```

⚠️ **Overpass 인스턴스를 섞지 말 것.** 미러(kumi.systems)는 요청마다 다른 옛
스냅샷을 돌려주는 경우가 있어, 인접 폴리곤이 서로 다른 시점에서 오면 공유 경계가
어긋난다. `extract.py`는 엔드포인트를 하나로 고정하고 모든 배치의 `osm_base`가
동일한지 검사한다.

⚠️ **단순화는 반드시 mapshaper로.** per-polygon 단순화(예: PostGIS `ST_Simplify`)는
인접 시군구 사이에 틈을 만든다. mapshaper는 공유 arc를 유지한다.
