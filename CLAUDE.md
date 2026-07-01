# CLAUDE.md — colormap 프로젝트 가이드

> 이 파일은 Claude Code가 매 세션 시작 시 읽는 프로젝트 안내문이다.
> 프로젝트가 진행되며 계속 업데이트한다 (특히 "현재 단계" 섹션).

## 프로젝트 한 줄 정의

여행 기록을 세계지도 위에 쌓고, 도시 단위로 남의 여행을 발견하는 **위치 기반 여행 SNS**.
지도 색칠은 진입점일 뿐이고, 핵심 가치는 도시 안에서 흐르는 콘텐츠와 발견(탐색)에 있다.

## 앱 식별자 (확정)

- **앱 이름**: Tintrail (tint + trail, "여행의 색 자취" — 구 colormap에서 변경)
- **android.package / ios.bundleIdentifier**: `com.tintrail.app`
- **slug**: `tintrail` / **scheme**: `tintrail`

## 기술 스택 (확정)

- **앱**: Expo (React Native) + TypeScript / 현재 **Expo SDK 54** (Expo Go 호환 위해 54로 시작, 추후 56으로 업그레이드 예정)
- **네비게이션**: Expo Router (파일 기반)
- **백엔드/DB**: Supabase (Postgres + PostGIS)
- **지도**: `@maplibre/maplibre-react-native` **v11** — New Architecture 전용, Feature State로 나라 색칠 적합, 무료
  - v11 API 주의 (v10과 크게 다름):
    - 지도: `<Map mapStyle={...}>` (구 `MapView`)
    - 카메라: `<Camera initialViewState={{centerCoordinate, zoomLevel}}>` (구 `defaultSettings`)
    - 소스: `<GeoJSONSource id data promoteId>` (구 `ShapeSource` + `shape` prop)
    - 레이어: `<Layer id type="fill"|"line"|... paint={{...}}>` 단일 컴포넌트 (구 `FillLayer`/`LineLayer`)
    - paint 키는 Style Spec 형식: `'fill-color'`, `'line-width'` 등 (camelCase 아님)
    - `style` prop은 deprecated → `paint`/`layout` 사용
  - 네이티브 모듈 → Expo Go 불가, **개발 빌드 필수**
- **빌드 방식**: 로컬 안드로이드 `npx expo run:android` (Windows 환경, 맥 없음)
  - 이후 JS 핫리로드: `npx expo start --dev-client`
  - iOS 빌드는 EAS 클라우드 빌드 사용
- **이미지**: Supabase Storage (추후 CDN 전환 여지)
- **빌드/배포**: Expo EAS (Build / Submit / Update)
- **결제(추후)**: RevenueCat + 스토어 인앱결제
- **분석/모니터링(추후)**: PostHog + Sentry

## 현재 단계 ⭐ (자주 바뀌는 부분)

- **지금: Phase 0 — MapLibre 연동 + dev build 전환 + 빈 지도**
  - 지도 탭에 MapLibre `<Map>` + `<Camera>` 연결 완료 (임시 demotiles 스타일)
  - dev build(`npx expo run:android`) 필요 — Expo Go로는 지도 뜨지 않음
  - 다음: Phase 1 Supabase 인증/온보딩 → Phase 2 나라 색칠 지도
- v1 범위 안에서만 구현할 것. v1.1, v1.2 기능은 아직 만들지 말 것.
- 환경 셋업 완료: Expo 프로젝트 생성됨, GitHub 연결됨.
- **디자인 단계 완료**: 디자인 토큰·네비게이션·화면별 사양 확정 → docs/PRD.md 6~8장에 반영.
- **C-1 완료**: 나라상세 게시물 사진 그리드(3열, 대표사진, 여러장 배지).
- **C-2-1a 완료**: `post-media` private Storage 버킷 + RLS 정책 마이그레이션 작성 (설계: docs/PRD.md 9.5). db push는 아직 — 다음: C-2-1b 사진 선택/업로드 코드(expo-image-picker 도입, dev build 재빌드 필요).

## 기능 범위 (단계별 — 범위 밖은 건드리지 말 것)

### v1 (현재 목표 — "혼자 써도 좋은 기록 앱")

- 회원가입 / 로그인 (이메일 + 소셜 로그인, Apple 포함) + username 2단계 온보딩(유니크·실시간 중복 체크)
- 세계지도(choropleth, 평면↔3D 토글)에서 가본 **나라 색칠** (나라 단위 / ISO 3166-1 / Natural Earth 경계, 나라별 색 선택 — **v1은 고정 팔레트 8색만, 무료**)
- 나라 탭 → 나라 상세(접힌 지도 미리보기 + 인스타식 정사각형 사진 그리드, 도시별 필터) → **위치별 사진+글 기록** (자유 핀, 위경도)
- 작성: **도시 선택 필수**(country_code는 선택 도시에서 자동 파생 — 사용자 입력 불필요) · 위치는 **지도 핀 + 장소 검색(지오코딩) 둘 다**, 사진 **다중 첨부 + 대표 지정**(post_media 1:N, 대표=order_index 0)
- 게시물 가시성 토글 (public / friends / private, 기본 '전체공개')
- 계정 가시성 토글 (public / private — 프로필 설정 안)
- 내 프로필 = 통계(방문 도시/나라/게시물 수) + 내 사진 그리드 (**미니 지도 없음** — 지도 탭과 중복)

### v1.1 (아직 만들지 말 것)

좋아요 · 댓글 · 친구(상호 수락) · 같은 도시 내 시간순 루트 선 · 사진 위치 필터 토글(EXIF 기반 핀 근방 사진 추천) · 첨부 사진 순서 재정렬(order_index) · 신고/차단 · 푸시 알림 · **남의 프로필 보기(그 사람 색칠 세계지도 포함)** · **프로필 게시물 나라별·도시별 그룹핑 뷰**

### v1.2 (아직 만들지 말 것)

탐색(돋보기) 탭 · 색깔 구매(소액 결제 — 컬러휠·그라데이션·hex 직접입력 잠금해제. v1 고정 팔레트 8색은 계속 무료) · 프리미엄 구독

## 디자인 / UI 구조 (디자인 단계 확정 — 상세는 docs/PRD.md 6~8장)

- **디자인 토큰**: 흰 배경 · 액센트 주황 `#ff6a2b`(앱 테마색) · 둥근 모서리 · Pretendard · 390×844 기준.
  - ⚠️ 테마 주황 ≠ 도시 색칠 색. 도시 색은 사용자가 도시별로 고르는 별개 값(city_visits.color).
- **네비게이션**: 하단 탭 3개 = 지도 / +(작성) / 프로필. 탐색(돋보기) 탭 자리는 v1.1용으로 비워둠. **첫 화면 = 지도 탭**.
- **공통 컴포넌트**: 인스타식 정사각형 사진 그리드 — 나라 상세·프로필이 재사용.
- **나라 상세**: 상단 접힌 지도 미리보기 + 사진 그리드(기본: 나라 전체 게시물), 이름 옆 ▾로 '기록 있는 도시' 필터, 나라 색 선택은 더보기(…) 안.
- 색칠 단위 = **나라** (ISO 3166-1). 나라 경계 = Natural Earth GeoJSON(퍼블릭 도메인). 도시 경계 폴리곤 불필요.

## 권한 / 가시성 모델 (이 앱의 심장 — 반드시 준수)

- **계정**: `public` | `private`. 검색하면 계정 자체는 누구나 보이지만, private 계정의 *내역*은 친구만 본다.
- **게시물**: `public` | `friends` | `private`. private 게시물은 계정 설정과 무관하게 **작성자 본인만** 본다.
- **친구**: 상호 수락(양방향).
- **가시성 판정** (뷰어 V가 작성자 A의 게시물 P를 볼 수 있는가):
  1. V == A → 보임
  2. P가 private → 차단
  3. P가 friends → V와 A 친구일 때만
  4. P가 public → A가 public이면 모두 / A가 private이면 친구만
- **탐색 피드** = (A public AND P public) ∪ (A가 내 친구 AND P가 public 또는 friends)
- ⚠️ 이 권한은 **클라이언트가 아니라 Supabase RLS(DB)로 강제**한다. 클라이언트 필터만으로 막지 말 것.

## 장소 기록 방식

- **도시**: 사전 정의된 참조 목록(`cities` 테이블)에서 선택 → 지도 색칠·통계의 기준.
- **도시 안 위치**: 자유 핀(위경도). 게시물이 이 핀에 붙는다.
- **루트**: 같은 도시 내 게시물을 `taken_at` 기준 정렬해 선으로 잇는다 (별도 테이블 없이 계산으로 도출, v1.1).

## GeoJSON 경계 데이터

- **파일**: `assets/geo/countries.json` — Natural Earth 50m, 242개 피처, 278KB
- **스키마**: `feature.id` = ISO 3166-1 alpha-2 대문자 / `properties.cc` = 동일한 ISO A2 코드 / `properties.nm` = 나라 이름
- **join 키**: `feature.id` (= `cc`) ↔ DB `posts.country_code` / `country_visits.country_code` (`char(2)`)
- **promoteId**: ShapeSource에 `promoteId="cc"` 설정 — feature-state 키도 `cc` 기준
- **엣지케이스 (내용/스키마 절대 수정 금지)**:
  - Kosovo = XK (ISO 미공인, 자체 코드)
  - 의존영토 자기코드: GL(그린란드), PR(푸에르토리코) 등
  - 중복 id 의도적: SO(소말리아/소말릴란드), CY(키프로스/북키프로스), AU(오스트레일리아 본토+영토) 등
  - Siachen 빙하 = 코드 없음(피처 없음)
- **색칠 정책**: 나라 단위 색칠, 색은 `country_visits.color`로 사용자가 나라마다 지정.
  나라 색 선택 UI는 나라상세 화면(v1 범위). 이 파일의 내용·스키마 변경 금지.
  - **v1 = 고정 팔레트 8색만, 무료.** 컬러휠·그라데이션·hex 직접입력은 v1.2 유료 잠금해제(소액 결제) — v1에서 만들지 말 것.

## 데이터 모델 (요약 — 상세 SQL은 docs/PRD.md 참고)

profiles, friendships, cities, country_visits, posts, post_media, post_likes, comments

- PostGIS `geography(point, 4326)` 사용 (cities.centroid, posts.location)
- 전체 스키마 + RLS 정책은 **docs/PRD.md 9장**에 있음. 마이그레이션은 거기서 가져올 것.
- 게시물 사진은 Supabase Storage private 버킷 `post-media` (경로 `posts/{user_id}/{post_id}/{파일명}`). 보안 설계·RLS 정책은 **docs/PRD.md 9.5** 참고.

## 코딩 규칙 / 선호

- 언어: TypeScript (strict 지향)
- 한 번에 거대한 변경 말고, 작은 단위로 나눠서 작업하고 설명할 것
- 권한·보안 관련 코드는 특히 신중하게, RLS와 일관되게
- 비밀키 주의: `anon` 키만 앱에. `service_role` 키는 절대 앱 코드/레포에 넣지 말 것
- `.env`는 `.gitignore`에 포함 (커밋 금지)
- 커밋 메시지는 간결한 conventional 스타일 (feat:, fix:, chore: 등)

## 참고 문서

- `docs/PRD.md` — 제품 정의서 + 전체 DB 스키마 + RLS 정책 + PostGIS 쿼리 예시
