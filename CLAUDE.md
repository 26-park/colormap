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
  - v11 API 주의 (v10과 크게 다름, 설치 버전 11.3.6 기준 — 아래는 `node_modules` 실제 타입으로 검증됨):
    - 지도: `<Map mapStyle={...}>` (구 `MapView`)
    - 카메라: `<Camera initialViewState={{center, zoom}}>` (구 `defaultSettings`)
      - ⚠️ **`centerCoordinate`/`zoomLevel` 아님 — `center`/`zoom`.** `center`는 `LngLat` 튜플 `[lng, lat]`.
        2026-07-02(C-2-3b) 실기기에서 미니맵이 진입 나라로 안 움직이는 버그로 발견 — 잘못된 키는 에러 없이 조용히 무시되고 카메라가 그냥 기본 위치에 머문다. `tsc`가 이미 `'centerCoordinate' does not exist` 에러를 냈었는데 "구버전 타입 정의 이슈"로 잘못 판단하고 넘어갔던 것 — **이 라이브러리는 앞으로 tsc 에러를 타입 노이즈로 넘기지 말고 실제 API 불일치로 의심할 것.**
    - 소스: `<GeoJSONSource id data>` (구 `ShapeSource` + `shape` prop)
      - ⚠️ `promoteId`는 설치된 11.3.6의 `GeoJSONSourceProps`에 없음(타입에도 없음, 넘겨도 조용히 무시). 현재 나라 색칠은 feature-state가 아니라 `fill-color`의 `['match', ['get','cc'], ...]` 표현식으로 GeoJSON properties를 직접 읽어서 동작 — 그래서 `promoteId` 없어도 영향 없음. **feature-state 기반으로 바꾸게 되면 이 버전에서 가능한 대체 방법부터 재확인.**
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

- v1 범위 안에서만 구현할 것. v1.1, v1.2 기능은 아직 만들지 말 것.
- 환경 셋업 완료: Expo 프로젝트 생성됨, GitHub 연결됨. dev build(`npx expo run:android`) 필요 — Expo Go로는 지도/카메라/위치 등 네이티브 모듈이 안 뜸.
- **디자인 단계 완료**: 디자인 토큰·네비게이션·화면별 사양 확정 → docs/PRD.md 6~8장에 반영.
- **🎉 P2 전체 완료 (2026-07-20)**: 에러 처리 체계화(Phase J) / Pretendard 폰트(Phase K) / 공개범위 묶음(Phase L) / 의존성 정리(Phase M) 4개 전부 끝났다. P0/P1/P2 다 완료.
- **🎉 친구 기능(Phase O) 전체 완료 (2026-07-22)**: 1~5단계 전부 끝났다. 상세는 아래 Phase O 참고.
- **🎉 좋아요(Phase P) 전체 완료 (2026-07-27)**: 게시물 상세 하트+개수. 상세는 아래 Phase P 참고.
- **🎉 댓글(Phase Q) 전체 완료 (2026-07-31)**: Q-0(프로필 fail-closed) / Q-1(하드닝 마이그레이션) / Q-2(데이터 계층) / Q-3(게시물 상세 댓글 UI) 4개 전부 끝났다. 상세는 아래 Phase Q 참고.
- **⭐ 다음 세션 시작점**: 아래 로드맵 순서대로 (배경은 바로 아래 "⭐ 출시 시점 방향 결정" 참고).
  1. ✅ **친구 기능 UI — 완료 (Phase O)**
  2. ✅ **좋아요 — 완료 (Phase P)**
  3. ✅ **댓글 — 완료 (Phase Q)**
  4. ⭐ **진행 중: 한국 시군구 색칠 (Phase S)** — **S-0~S-4 완료 (2026-08-16)**. 소스 재확정(OSM/ODbL) → 경계 230개 확보·적재 → 서버측 판정 트리거 → 방문 테이블+RLS까지 끝났다. **DB 계층은 완성. 남은 건 전부 앱/렌더링이다.**
     - **다음은 S-5(지도 렌더링)** — 여기에 **해안선 클립 → 재단순화 → 용량 재측정**과 **설정 → "지도 데이터 출처"(ODbL 출처표시 UI)** 가 포함된다. 그다음 S-6(시군구 상세/색 선택).
     - ⚠️ **미결 1 — 해안선 클리핑(S-5)**: 판정용은 미클립 확정, **렌더링용만 클립**한다. 순서는 **클립 → 단순화 → 용량 재측정**(현재 629KB는 미클립 기준이라 달라진다). 클립 소스는 `osmdata.openstreetmap.de` land polygons.
     - ⚠️ **미결 2 — 인천 신설 4개 코드**: `sgg_code` null로 두고 진행 중. 아무것도 막지 않으므로 급하지 않다.
     - ✅ **ODbL 4.6 공개 검증 완료 (2026-08-16)**: 푸시 후 **익명(비로그인) 접근으로 실측** — 저장소 `visibility: public`, `raw.githubusercontent.com`에서 경계 파일 다운로드 200/206, 크기 로컬과 일치, GeoJSON 정상 파싱. **로컬 커밋만으로는 충족되지 않으니(공개돼야 효력) 경계 파일을 고칠 때마다 푸시까지 확인할 것.**
  5. 장소검색(지오코딩)
  - ⛔ **3D 지구본 토글은 백로그로 내림 (2026-07-31 확정)**: 2D 평면지도로 충분하다고 판단 — **출시 후 재검토**. 지도 탭 헤더의 평면지도/지구본 토글 UI는 현재 정적 껍데기(`app/(tabs)/index.tsx`)로 남아 있다. **이후 세션에서 "지구본부터 만들자"로 새지 말 것.**
  6. **출시 준비**: 구글 플레이 콘솔 개발자 등록($25) + AAB 빌드(EAS, `preview` 프로필은 APK라 별도 프로필 필요) + 스토어 등록 자료(스크린샷, 설명, 개인정보처리방침 URL) 준비
  - 착수 전 반드시 확인: "중요 결정·원칙" — 소셜 로그인은 이메일+구글만(카카오/네이버/애플 v1 제외), SDK 54→56 업그레이드는 출시 후, `fontWeight` 금지(`fontFamily: theme.fonts.*`만), 나라 색칠 생성/삭제는 DB 트리거 전담(앱은 색만 UPDATE).
- **완료 (C-1 ~ Phase D)**:
  - C-1: 나라상세 게시물 사진 그리드(3열, 대표사진, 여러장 배지)
  - C-2-1a: `post-media` private Storage 버킷 + RLS 정책 (설계: docs/PRD.md 9.5)
  - C-2-1b: 사진 선택(expo-image-picker) → 리사이즈(expo-image-manipulator, 긴 변 1600px/JPEG 0.8) → post-media 업로드
  - C-2-2a: `posts.city_id` nullable화 (db push 완료, `country_code`는 계속 NOT NULL)
  - C-2-2b: 위치 핀 선택(지도 탭 ↔ 현재 위치, expo-location) + `lib/countryFromCoord.ts`(point-in-polygon)로 나라 자동 파생
  - C-2-1c: 나라상세 그리드에 signed URL 적용 (`lib/media.ts` — 외부 URL/저장 경로 구분, 1시간 배치 발급)
  - C-2-3a: `posts.place_label` 컬럼(db push 완료) + `lib/posts.ts`의 `savePost()`로 사진+위치/나라+캡션/공개범위/지역명을 묶어 `posts`/`post_media` INSERT.
    - **결정**: 도시는 구조적 `cities` 엔티티로 만들지 않는다. 위치는 핀(`location`)+나라(`country_code`) 필수 + 자유 지역명(`place_label`) 옵셔널. 필요 시 나중에 지오코딩으로 정규화 업그레이드(cities 자체 구축은 안 함).
  - C-2-3b: compose 정식 작성 폼(design/write.png 시안 반영) + 나라상세 "기록 추가" FAB 진입점. Camera `initialViewState`는 `centerCoordinate`/`zoomLevel`이 아니라 `center`/`zoom`(실기기 버그로 발견, v11 API 주의 항목 정정).
  - Phase E: `app/post/[id].tsx` 게시물 상세 화면(사진 캐러셀, 위치 미니맵, 글, 공개범위·작성일). 나라상세 그리드 셀 탭으로 진입. `posts_with_coords` 뷰(`security_invoker=true`, `ST_X`/`ST_Y`로 lng/lat 미리 계산) 추가 — `posts.location`이 PostgREST로 WKB 16진수로 내려와 프론트에서 파싱 불가능한 문제 해결, 나라상세 핀·프로필 등에서도 재사용 가능.
  - Phase D-1: 프로필 탭 더미 제거, 실데이터 연결 — 통계 3개(나라/기록/친구, 전부 count-only 쿼리), 내 게시물 전체 그리드(C-1과 동일 패턴: 대표사진 order_index 최소, 여러장 배지, `resolveMediaUrls`), 셀 탭 → 게시물 상세. avatar_url/bio 있으면 표시.
  - Phase D-2: 프로필 그리드에 나라 필터 칩 + 정렬(최신/오래된순) + 서버 사이드 페이지네이션(`.range()`, `PAGE_SIZE=30`). `my_post_countries()` RPC(`security invoker`, db push 완료) 추가 — 내가 기록을 올린 나라만 칩으로 노출. 필터/정렬 변경 시 `requestId` 토큰으로 지연 응답 무시하며 처음부터 재로드, `onEndReached`는 `loadingRef`로 중복 가드. signed URL은 페이지 단위로만 발급(전체 일괄발급 금지 — 운영에서 중요). 통계 카드는 필터 무관 전체 기준 유지, 그리드 헤더 "내 기록 N"만 필터 적용된 별도 count.
  - Phase G-1: "색칠은 게시물 있는 나라만" 규칙을 DB 트리거로 강제. `posts` AFTER INSERT/UPDATE/DELETE 트리거(`sync_country_visit_on_post_change()`, SECURITY INVOKER)가 `country_visits`를 자동 동기화 — 게시물 저장 시 없으면 기본색(`#ff6a2b`, 브랜드 주황)으로 생성, 이미 있으면 유지(사용자가 고른 색 보존), 그 나라 게시물이 0개가 되면 삭제. `country_code`가 바뀌는 UPDATE(현재 앱엔 없음)까지 대비. SECURITY INVOKER 선택 근거: `posts_owner_all` RLS가 이미 `user_id = auth.uid()`를 강제하므로 트리거도 본인 행만 건드리게 됨(DEFINER로 권한을 올릴 필요 없음) — `search_path`는 고정. 기존에 게시물 없이 칠해져 있던 CN 데이터 1행 정리 완료.
  - Phase G-2: 나라상세(`app/country/[cc].tsx`) 색칠 UI를 G-1 규칙에 맞춤 — **앱은 색칠을 생성하지 않는다(트리거가 함). 앱은 이미 있는 색칠의 색만 바꾼다.** 게시물 0개면 색 동그라미 비활성(회색 링, opacity 0.5) + 탭 시 "이 나라에 기록을 추가하면 색칠돼요" 인라인 안내(2초 후 자동 소멸), 팔레트 안 열림. 게시물 1개 이상이면 기존대로 팔레트 오픈. 저장 로직은 `upsert` → `update`(+`.select()`로 영향 행 수 확인)로 변경, INSERT 경로 완전 제거. 이미 로드 중인 나라상세 게시물 개수(`posts.length`)로 판단 — 추가 쿼리 없음.
  - Phase E-2: 게시물 삭제. `lib/posts.ts`의 `deletePost(postId)` — ⚠️순서 엄수: post_media.url 먼저 조회(Storage 경로 확보, 외부 시드 URL은 `isExternalUrl`로 제외) → posts 삭제(cascade로 post_media, G-1 트리거로 country_visits 자동 정리) → Storage 파일 삭제(best-effort, 실패해도 console.error만·고아 파일은 TODO 주기적 정리). 게시물 상세(`app/post/[id].tsx`) `···` → 바텀시트("삭제") → Alert 확인(마지막 게시물이면 "색칠도 사라진다" 안내 추가, 삭제 전 해당 나라 내 게시물 count로 판단) → 삭제.
    - **나라상세 재조회**: `app/country/[cc].tsx`의 color·posts 조회를 `useEffect` → `useFocusEffect`(B-2와 동일 패턴)로 변경 — 게시물 상세에서 삭제/작성 후 돌아오면 그리드와 색 동그라미가 즉시 갱신된다. 재조회 중에도 기존 그리드를 유지하다 교체(깜빡임 방지, `loadedPostsOnceRef`로 최초 1회만 스피너).
    - **네비게이션 스택 정리**: 게시물 상세 삭제 후, compose 저장 후 모두 `router.replace('/country/[cc]')` 대신 `router.dismissTo(...)` 사용. `country/[cc]`에 dynamic 세그먼트별 `getId`를 등록하지 않아 POP_TO가 route 이름만으로 스택에서 일치하는 화면을 찾는다는 점을 확인 — 나라상세는 각 진입 경로(게시물 상세/compose)당 스택에 항상 하나뿐이므로, 저장/삭제된 나라가 진입 나라와 달라도(compose에서 다른 나라에 핀을 찍은 경우 포함) 그 화면을 그대로 찾아 재사용하고 params만 새 나라로 덮어쓴다 — 별도 "다른 나라면 replace" 분기 불필요. `replace`로 새 인스턴스를 쌓으면 스택에 나라상세가 중복돼 뒤로가기 시 이전 화면이 다시 보이는 문제가 있었음.
  - Phase G-3 (v1 출시 점검, 진행 중):
    - 1단계: PRD 대비 구현 현황 감사 완료(완료/미완료/PRD 밖 필요 항목/TODO·디버그 흔적/위험 요소 정리, 2026-07-10).
    - 보안 수정: `country_visits` INSERT/UPDATE RLS 구멍 수정 — `country_visits_owner_all`(FOR ALL)을 INSERT/UPDATE/DELETE로 분리하고 INSERT·UPDATE의 WITH CHECK에 "그 나라에 내 게시물이 있어야 함" exists 조건 추가(API 직접 호출로 게시물 없는 나라를 칠하거나 UPDATE로 country_code를 바꿔 우회하는 경로 차단). G-1 트리거(SECURITY INVOKER)가 여전히 통과하는지 롤백 트랜잭션으로 라이브 DB에서 실검증(INSERT 차단/트리거 자동색칠/트리거 자동삭제/색 UPDATE 4가지 모두 확인, 운영 데이터 무오염).
    - 2단계: EAS 안드로이드 APK 빌드 파이프라인 점검. `eas.json`에 `cli.appVersionSource: "remote"`, `preview` 프로필에 `environment: "preview"` + `android.buildType: "apk"` 추가(기존엔 preview가 APK가 아니라 기본 AAB를 뽑는 상태였음). Supabase URL/anon key는 `EXPO_PUBLIC_*`라 비밀은 아니지만(RLS로 보호) `.env.local`이 git 미추적이라 EAS 클라우드 빌드엔 없음 — `eas env:create`(EAS 환경변수, `--environment preview`)로 주입하는 방식 채택. `android/`가 gitignore돼 있어 CNG 방식(로컬 `expo run:android`와 동일하게 매번 prebuild) — EAS 빌드 리스크 낮음.
    - 3단계: EAS 안드로이드 preview APK 빌드 성공 + 실기기 검증 완료(2026-07-11). `eas init`으로 `app.json`에 `extra.eas.projectId` + `owner` 생성됨. 실기기에서 로그인·지도·사진·GPS 위치 모두 정상 동작 확인 — APK 파이프라인 검증 끝. 빌드는 expo.dev의 `tintrail` 프로젝트에서 확인 가능.
    - 4단계: "작은 정리 항목" 4개 완료(2026-07-12, 커밋 `47b1909`) — 탐색 탭 `href: null`로 숨김(하단 탭 지도/프로필 2개만), 프로필 ⚙️ 로그아웃에 `Alert` 확인 다이얼로그 추가(정식 설정 화면은 여전히 없음, TODO로 남김), Expo 템플릿 스캐폴드 일괄 제거(`app/modal.tsx` + 연쇄적으로 unused였던 `themed-text/view`·`collapsible`·`parallax-scroll-view`·`hello-wave`·`external-link`·`haptic-tab`·`use-theme-color`·`use-color-scheme`·`react-logo` 이미지들, import 그래프 추적으로 확인 후 삭제), PRD 갱신(장소검색·3D 지구본 토글을 v1.1로 명시). 실기기 검증 중 "explore 탭이 안 사라진다"는 혼선이 있었는데 원인은 코드가 아니라 **Expo Go로 QR 스캔해서 들어간 것**이었음(이 프로젝트는 네이티브 모듈 때문에 Expo Go 자체가 불가) — 앱 아이콘이 아직 기본 Expo 템플릿이라 dev client와 Expo Go가 헷갈리기 쉬웠던 것도 원인. dev client(`com.tintrail.app`, 이름 "Tintrail")로 재확인 후 정상 동작 확인됨.
    - 5단계: **구글 소셜 로그인 완료**(2026-07-13, 커밋 `7b710b8`) — `@react-native-google-signin/google-signin`(v16) + `supabase.auth.signInWithIdToken`. `lib/googleAuth.ts`(`GoogleSignin.configure`)를 `context/auth.tsx` 최상단 side-effect import로 앱 시작 시 1회 실행, `hooks/use-google-sign-in.ts`(로그인/회원가입 공통 훅, `isSuccessResponse`/`isCancelledResponse`/`isErrorWithCode` 최신 API), 로그아웃 시 `GoogleSignin.signOut()`도 같이 정리(안 하면 계정 재선택 없이 같은 계정으로 재로그인됨). 신규 유저 온보딩 분기는 **기존 코드가 이미 provider-무관**이라 수정 불필요였음 — `context/auth.tsx`의 `onAuthStateChange`+`checkProfile`이 세션 유무만 보고 판단, `app/_layout.tsx`의 리다이렉트도 동일, `username.tsx`의 insert/중복체크도 `session.user.id` 기반이라 그대로 적용됨.
      - **외부 설정**: Google Cloud Console에 Android 클라이언트(`com.tintrail.app`) + Web 클라이언트 생성, Supabase Auth Google provider에 Client IDs(Web+Android) + Web Secret 등록. `webClientId`는 코드에 하드코딩하지 않고 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`로만 참조(`.env.local` + `eas env:create --environment preview`).
      - ⚠️ **SHA-1은 두 개 다 등록해야 함**: EAS 키스토어 SHA-1(`eas credentials`로 확인, EAS 빌드용)과 **로컬 디버그 키스토어 SHA-1**(`android/app/debug.keystore`, `npx expo run:android`용 — `~/.android/debug.keystore` 아님, `build.gradle`의 `signingConfigs.debug.storeFile`이 프로젝트 로컬 파일을 가리킴). 로컬 디버그 키스토어는 Expo 기본 템플릿이 공통으로 쓰는 잘 알려진 값(`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`)이라 등록해도 보안 문제 없음. 하나만 등록하고 다른 쪽으로 테스트하면 `DEVELOPER_ERROR(code 10)` 발생 — 실제로 이 순서(EAS SHA-1만 등록 → 로컬 디버그 빌드로 테스트)로 재현·확인함. Google Cloud Console에서 같은 Android OAuth 클라이언트에 SHA-1 여러 개 추가 가능.
      - ⚠️ **Supabase "Skip Nonce Check" 필수 (Android)**: `@react-native-google-signin/google-signin`의 무료 `GoogleSignin.signIn()`은 Android에서 nonce를 지원하지 않음(iOS 전용·유료 기능). Supabase의 `signInWithIdToken`은 기본적으로 nonce 검증을 하므로, 그대로면 "Passed nonce and nonce in id_token should either both exist or not" 에러로 항상 막힘. **Supabase 대시보드 → Authentication → Providers → Google → Skip Nonce Check를 켜야 함**(켜짐 확인됨). nonce 검증 우회이므로 이 provider를 Google 외 다른 용도로 재사용하지 않도록 주의.
      - 실기기 전체 흐름 검증 완료: 신규 로그인→온보딩(username만, 구글 이름/사진 자동 채우기 없음, A안 확정대로)→메인, 재방문 시 온보딩 없이 바로 메인, 로그아웃 후 계정 재선택 모두 정상.
    - 6단계: **계정 삭제 기능 완료**(2026-07-13) — Supabase 공식 패턴대로 `supabase/functions/delete-account`(Edge Function, service_role)에서 `auth.admin.deleteUser()` 한 번으로 처리, DB 쪽은 전부 FK cascade(profiles→posts→post_media/comments/post_likes, country_visits, friendships)와 G-1 트리거로 자동 정리됨(앱이 개별 테이블을 지우지 않음). Storage(`post-media` 버킷)는 FK 관계가 없어 별도로 `posts/{userId}` prefix `list()`+`remove()`(2단계 재귀, best-effort). 본인 확인은 요청 헤더의 JWT로 `auth.getUser()`를 거쳐 얻은 userId만 사용(body로 안 받음 — 남 계정 삭제 방지). 앱 쪽은 프로필 탭 그리드 최하단(`ListFooterComponent`)에 "계정 삭제" 텍스트 링크 + 2단계 `Alert` 확인(destructive) → `supabase.functions.invoke('delete-account')` → 성공 시 기존 `signOut()` 재사용(로컬 세션+Google 캐시 정리). mini 계정으로 전체 흐름(삭제→signOut→재로그인 시 신규 온보딩) 실기기 검증 완료.
    - 7단계: **개인정보처리방침/이용약관 완료**(2026-07-14, 커밋 `c254223`) — `docs/legal/privacy.html`·`terms.html` 작성(본문은 사용자가 직접 제공, 번호 항목은 `<h2>`/`<h3>`, 목록은 `<ul>`/`<ol>`로 구조화) 후 GitHub Pages(저장소 `26-park/colormap`, `main` 브랜치 `/docs` 폴더)로 호스팅. 최종 URL `https://26-park.github.io/colormap/legal/privacy.html`(terms도 동일 패턴) — `constants/legal.ts`의 `LEGAL_URLS`에 한 곳에서만 정의, sign-up.tsx 약관 동의 안내와 profile.tsx 계정 삭제 근처에 `Linking.openURL`로 연결.
    - 8단계: **앱 아이콘/스플래시 교체 완료**(2026-07-17) — 주황 트레일 심볼로 교체. `android-icon-background.png`/`android-icon-monochrome.png` 이미지 파일 삭제하고 `app.json`의 `android.adaptiveIcon.backgroundColor`를 `#ff6a2b`(브랜드 주황)로 대체(`foregroundImage`만 유지). 스플래시도 `backgroundColor: "#ff6a2b"`로 통일(기존 light `#ffffff`/dark `#000000` 분기 제거). 1024 원본은 스토어 등록용으로 별도 보관, 512는 재사용 예정. 에뮬레이터 재빌드로 아이콘·스플래시 노출 확인 완료.
    - 9단계: **정식 설정 화면 완료**(2026-07-18) — `app/settings.tsx` 신설(스택 push, `app/post/[id].tsx`와 동일한 뒤로가기+타이틀 헤더 패턴). 계정(로그아웃/계정 삭제)·약관(이용약관/개인정보처리방침)·앱 정보(버전, `expo-constants`의 `Constants.expoConfig?.version`) 3섹션 카드 UI로 통합. 로그아웃·계정 삭제 로직(확인 문구, 2단계 확인, `delete-account` Edge Function 호출, `signOut()`)은 새로 짜지 않고 `profile.tsx`에서 그대로 이동. `profile.tsx`의 ⚙️ 버튼은 `router.push('/settings')`로 변경(기존 로그아웃 다이얼로그 제거), 그리드 하단에 흩어져 있던 계정 삭제 링크·약관 링크도 제거해 중복 없앰. 에뮬레이터에서 진입/로그아웃/약관 링크/계정 삭제 다이얼로그 전부 검증 완료.
  - Phase H: **나라 이름 한글화 완료**(2026-07-17) — `lib/countryNamesKo.ts` 신설, GeoJSON 고유 `cc` 237개 전부 정적 매핑(`Record<string, string>` + `getCountryNameKo(cc, fallback?)`). `Intl.DisplayNames`는 조사 결과 기각 — Hermes(특히 Android)에서 크래시 리포트가 실재하고(`facebook/hermes#1144`) Meta 내부적으로 Intl 투자가 끊긴 상태라 신뢰 불가로 판단, 정적 매핑으로 확정(GeoJSON 원본은 CLAUDE.md 수정 금지 원칙 유지, 별도 파일로 관리). 검증 스크립트로 GeoJSON cc와 매핑 키 완전 일치(누락/초과 0) + 중복 한글명 0건 확인. 표시부 5곳(나라상세 타이틀, compose 헤더, 게시물상세 헤더/위치, 프로필 나라 칩) 교체 — 프로필 칩은 원래 `cc` 코드가 그대로 노출되던 버그도 같이 발견해 수정, `localeCompare('ko')` 정렬 추가.
  - Phase I: **나라상세 "내 기록/모두" 탭 완료**(2026-07-17) — 나라상세 기본 화면이 "모두의 공개 게시물"이 아니라 "내가 이 나라에 남긴 기록"이어야 한다는 제품 의도에 맞춰 탭 분리(기본 `내 기록`, 두 번째 `모두`=기존 동작). 탭 전환 시 재조회는 `useFocusEffect`의 콜백 identity가 바뀌면 focus 상태에서도 즉시 재실행되는 특성(`@react-navigation/core`)을 이용해 `activeTab`을 의존성에 추가하는 것만으로 처리, race 방지는 프로필 D-2의 `requestIdRef` 패턴 재사용. **G-2 버그 수정**: 기존 `canColor`가 필터 없는 `posts.length`(=모두의 게시물)를 기준으로 삼고 있어서 "남이 이 나라에 공개 게시물을 올리면 내가 게시물이 없어도 색 팔레트가 열리는" 조용한 버그가 있었음(실제 DB 갱신은 `country_visits` UPDATE 조건의 `user_id` 필터로 막혔지만 UX상 팔레트가 열렸다 색 선택이 반영 안 되는 문제) — 탭 상태와 무관하게 항상 "내 게시물 수"만 세는 전용 count 쿼리(`myPostCount`, `head: true`)로 교체해 고정.
  - Phase J: **에러 바운더리 + 에러/빈상태 구분 완료**(2026-07-18) — 렌더 크래시 방지(A)와 조용한 fetch 실패 제거(B) 두 트랙.
    - **A. 루트 에러 바운더리**: `app/_layout.tsx`에 `ErrorBoundary` named export 하나만 추가(라우트별 아님). expo-router의 `Try` 컴포넌트가 이 파일의 default export(AuthProvider 포함 전체 트리)를 감싼다 — 소스(`node_modules/expo-router/build/views/Try.js`) 확인 결과 에러 유무에 따라 반환 엘리먼트 타입 자체가 바뀌므로(children ↔ ErrorBoundary) React가 매번 진짜 언마운트/리마운트를 수행, `retry()`가 실제 리셋으로 동작함을 검증. 렌더 단계 동기 에러만 잡고(비동기 fetch 에러는 못 잡음) fallback UI는 흰 배경+주황 "다시 시도" 버튼.
    - **B. ErrorView + 화면별 적용**: `components/ErrorView.tsx`(기본형: 중앙 정렬+버튼 / `compact`형: 한 줄+밑줄 링크, 빈 상태 문구와 구분되게 항상 재시도 액션 포함) 신설 후 데이터 fetch 화면 전수조사 표를 만들어 적용 범위를 나눔 — 메인 콘텐츠(나라상세 그리드, 프로필 1페이지, 게시물 상세)는 ErrorView, 프로필 2페이지+는 compact, 지도/게시물 사진은 비블로킹 배너, 나머지(프로필 정보·통계·칩·filteredCount, 나라상세 color)는 영향 낮아 로그만 추가.
    - **실버그 2건 동시 수정**: ① 프로필 무한스크롤 2페이지+ 실패 시 기존엔 `hasMore`가 그대로 true로 남아 스크롤할 때마다 같은 실패 요청이 무한 반복됐음 — 에러 분기에서 `hasMore=false`로 내려 `onEndReached` 가드가 막게 하고, 재시도는 푸터의 compact ErrorView(`retryLoadMore`)로만 허용. ② 온보딩 username 중복확인(`(onboarding)/username.tsx`)이 실패 시 error 체크 자체가 없어 `data`가 `undefined`가 되면서 `'available'`로 잘못 판정되던 조용한 버그 발견 — fail-closed 원칙으로 수정: 실패 시 `'error'` 상태로 떨어뜨려 "확인하지 못했어요·다시 시도"를 보여주고(canSubmit이 'available'일 때만 통과하는 기존 조건이 자동으로 제출을 막음) 탭하면 `runCheck` 재실행.
    - **네트워크 실패 처리 검증**: postgrest-js 소스(`PostgrestBuilder.ts`)로 fetch 자체가 실패(비행기 모드 등)해도 `shouldThrowOnError`를 켠 적 없는 이상 예외로 throw되지 않고 `{ data: null, error }`로 정상 반환됨을 확인 — 그래서 위 error state 분기들이 서버 에러뿐 아니라 오프라인 상황에서도 동일하게 동작한다.
    - 검증: 온보딩 fail-closed(비행기 모드 → "확인하지 못했어요"+제출 비활성 → 복구 후 정상 진행) 에뮬레이터 실기기 확인 완료, 화면별 ErrorView/배너도 에뮬레이터로 확인 완료. 프로필 무한 재시도 수정은 `hasMore` 가드가 재호출을 코드 레벨에서 원천 차단함을 사전 검증(에뮬 시나리오 실행 대신 코드 검증으로 갈음).
  - Phase K: **Pretendard 폰트 적용 완료**(2026-07-18) — `constants/theme.ts`의 오랜 TODO(`// TODO: Pretendard 폰트 로드 후 여기에 fontFamily 추가`) 청산. 인프라(1단계)와 화면 교체(2단계)로 나눠 진행.
    - **1단계 — 인프라**: npm `pretendard@1.3.9`(라이선스 `OFL-1.1`, 상업적 사용·재배포 허용 확인) 배포 경로에서 정적 OTF 5종(Regular/Medium/SemiBold/Bold/ExtraBold, `assets/fonts/`)을 jsDelivr 고정 버전 URL로 받음 — 실사용 weight는 grep으로 400/500/600/700(다수)/800(프로필 통계 숫자 1곳) 확인 후 이 5개만 선정. **가변 폰트(PretendardVariable) 대신 정적 파일**을 쓰기로 확정 — Expo 공식 문서가 "variable fonts do not have support across all platforms, use static fonts for full platform support"라고 명시하고, RN 자체에도 커스텀 `fontFamily`+`fontWeight`를 같이 쓰면 안드로이드/iOS 둘 다 가짜 볼드나 시스템 폰트 폴백이 나는 알려진 문제가 있어 weight별 정적 파일+개별 fontFamily가 유일하게 안정적. 한글 서브셋 폰트도 배제 — `caption`/`place_label`처럼 사용자가 자유 입력하는 한글이 많아 서브셋 미포함 음절에서 글자가 깨질 위험. `components/AppText.tsx` 신설(`react-native`의 `Text`를 감싸 기본 `fontFamily: theme.fonts.regular` 부여, export 이름을 `Text`로 맞춰 다른 파일은 import만 `'react-native'` → `'@/components/AppText'`로 바꾸면 JSX는 안 건드려도 됨) — 화면 텍스트가 거의 다 한글이라 시스템 폰트와 자형 차이가 크게 보이는 게 이 방식을 택한 이유, `fontWeight` 있는 곳은 AppText 여부와 무관하게 각자 `fontFamily`로 덮어써야 하는 제약은 그대로 남음. `app/_layout.tsx`에 `useFonts` 추가해 기존 auth-loading 스플래시 게이트에 합류 — **fail-open 필수**: `[fontsLoaded, fontError]`를 둘 다 받아 `if (loading || (!fontsLoaded && !fontError)) return;`로, 폰트 로드 실패 시에도 스플래시에 영영 갇히지 않고 시스템 폰트로 진행(1차 구현 때 `fontError`를 안 받아 이 케이스를 놓쳤던 걸 리뷰로 발견해 수정). 안 쓰던 `theme.ts`의 `Fonts` export(템플릿 잔재, 프로젝트 어디서도 import 안 됨 — grep 확인)는 삭제.
    - **2단계 — 화면 교체**: 13개 파일 60곳 전부 `fontWeight: 'XXX'` → `fontFamily: theme.fonts.{regular|medium|semibold|bold|extrabold}`로 치환(fontWeight 키 완전 제거) + `import { Text } from 'react-native'` → `'@/components/AppText'`로 교체, 파일 단위로 나눠 진행하며 매 파일 후 tsc 체크. 루트 `ErrorBoundary`(`app/_layout.tsx`) 폴백도 처음엔 "위험 최소화" 명목으로 예외 취급하려 했으나, `AppText`가 `theme`(순수 객체) 하나만 의존하는 트리비얼한 컴포넌트라 예외로 둘 근거가 없어 그냥 통일 — **의도적 예외 0개**. 완료 후 `grep -rn "fontWeight" --include="*.tsx"`로 프로젝트 전체 검증, 남은 매치는 `AppText.tsx` 안의 "fontWeight 쓰지 말 것" 설명 주석 1건뿐(코드 아님) — 잔존 0곳 확인. `tsc` 전 구간 클린(기존 Deno 무관 에러 7개 제외), 에뮬레이터로 전 화면(로그인/지도/나라상세/프로필/작성/게시물상세/설정/온보딩) Pretendard 적용 + 레이아웃 안 깨짐 확인 완료.
    - **원칙(향후 화면에도 적용)**: 새 화면은 `'react-native'`가 아니라 `'@/components/AppText'`에서 `Text`를 import할 것. `fontWeight` 스타일 키는 이 프로젝트에서 금지 — 굵기는 항상 `fontFamily: theme.fonts.*`로 지정.
  - Phase L: **공개범위 묶음(P2 마지막) 완료**(2026-07-19) — 게시물 사후 변경 + 계정 공개범위 토글. 조사 결과 `posts.visibility`(3단 enum)·`profiles.visibility`(2단 enum)·RLS(`posts_select_visible`)가 이미 정확한 의미론(계정 비공개+게시물 공개 → 친구만, 계정 다시 공개 시 라이브 조인으로 자동 복원)을 구현하고 있어서 **마이그레이션·RLS 변경 없이 UI만 추가**.
    - `lib/posts.ts`에 `VISIBILITY_LABELS`/`VISIBILITY_OPTIONS`(friends 항목 `hidden: true`) 신설, `components/VisibilitySelector.tsx`로 세그먼트 토글을 뽑아 compose(작성)와 게시물 상세(편집)가 공유 — hidden 옵션은 "현재 선택값일 때만 예외로 보여준다"로 필터링해, 과거 friends로 저장된 글을 편집할 때 값이 사라진 척하지 않으면서도 새 글에서는 못 고르게 막음. compose는 이 교체만으로 자동으로 2개(전체공개/비공개)만 노출, 기본값 public 유지.
    - 게시물 상세(`app/post/[id].tsx`): `···` 바텀시트에 "공개범위 변경" 추가(삭제 위) → 2차 바텀시트에서 `VisibilitySelector`로 즉시 선택 반영. **낙관적 업데이트 + 실패 시 원복** 패턴(country/[cc].tsx의 색 변경과 다르게, 이번엔 이 패턴으로 결정) — 선택 즉시 화면 반영 후 `update()`, 실패하면 이전 값으로 되돌리고 `Alert.alert('변경하지 못했어요', ...)`.
    - 설정(`app/settings.tsx`): "계정" 카드 최상단에 "계정 공개범위" `Switch` 행 추가, `profiles.visibility` 신규 조회(로딩 스피너 → 실패 시 compact `ErrorView`+재시도, 조용한 실패 금지 원칙 유지). **비공개→공개 전환만 확인 다이얼로그**("전체공개로 설정한 게시물이 모든 사람에게 보이게 됩니다. 친구공개·비공개로 설정한 게시물은 계속 보호돼요"), 공개→비공개는 즉시 반영. 저장 실패 시 토글 원복.
    - **발견한 기존 잠재 결함(이번엔 안 고침, 별도 기록)**: `country_visits`가 "그 나라에 게시물이 하나라도 있으면" 생성되고 개별 게시물 가시성을 안 보기 때문에, 비공개 게시물만 있는 나라도 계정이 public이면 "방문 사실"이 샐 수 있는 구조 — 지금은 이걸 조회하는 화면이 없어 무해하지만 친구 기능 때 위험해짐. → 아래 "권한/가시성 모델" 섹션의 ⛔ 차단 조건으로 기록해둠(친구 기능 착수 전 반드시 확인).
    - 검증: 에뮬레이터 2계정(gp123 실계정 + 테스트 계정)으로 시나리오 10개(게시물 즉시 반영, A→B 전파, 계정 비공개 시 public 글 차단, 계정 재공개 시 자동 복원, 확인 다이얼로그가 공개 전환에만 뜸, hidden 예외 렌더링 — SQL로 기존 글 하나를 `visibility='friends'`로 강제 세팅해 편집 시트에 3칩+친구공개 강조로 뜨는지, 다른 값으로 바꾸면 다음부터 2칩만 뜨는지 — 비행기 모드 저장 실패 시 원복, 설정 최초 로딩/에러 상태) 전부 통과.
  - Phase M: **의존성 경고 정리(P2 마지막) 완료**(2026-07-20) — 조사 먼저(경고 5종 전수 수집: `expo start` 기동 로그/`expo-doctor`/`npm ls`/`npm install`/디바이스 logcat) 후 실제 문제만 골라 조치.
    - `expo-modules-core` 직접 의존성 제거: `compose.tsx`의 `uuid.v4()`(postId, 사진 아이템 id)를 `expo-crypto`의 `Crypto.randomUUID()`로 교체. **선택 근거**: `expo` 패키지가 uuid를 재노출하지 않음(빌드 결과물 grep으로 확인, "expo 재노출 API" 선택지는 애초에 존재하지 않았음) — `expo-crypto`는 이 프로젝트 SDK 54의 `bundledNativeModules.json`에 공식 등재된 패키지(`~15.0.9`)라 `expo install`로 버전이 자동으로 맞춰짐. `package.json`에서 `expo-modules-core` 직접 의존성 제거(node_modules엔 다른 expo 패키지들의 전이 의존성으로 계속 남아있음 — 정상).
    - `expo` 패치 버전 정렬: `npx expo install --fix`로 `54.0.35` → `~54.0.36`(SDK 54 안에서의 패치, 메이저/마이너 업그레이드 아님). `git diff`로 lockfile 변경분이 `expo` 자체와 그 CLI 툴체인 하위 의존성(`@expo/cli`, `@expo/config*` 등) + 신규 `expo-crypto`뿐임을 확인, 관련 없는 패키지(react-native, maplibre, supabase-js 등) 변경 없음.
    - **⚠️ `expo-crypto`는 네이티브 모듈** — JS 핫리로드로는 안 잡히고 `npx expo run:android` 재빌드가 필요하다(같은 이유로 향후 새 네이티브 모듈을 추가할 때마다 이 점을 기억할 것). 재빌드 전 에뮬레이터 저장공간을 `adb shell df -h /data`로 먼저 확인하는 습관 유지(과거 INSUFFICIENT_STORAGE로 설치가 막힌 이력 있음, G-3 감사 기록).
    - 검증: `expo-doctor` 18/18 통과(기존 2건 — expo-modules-core 직접 의존, expo 패치 버전 — 둘 다 해소), `tsc` 클린, 재빌드 후 logcat에 크래시/네이티브 모듈 에러 없음, 스모크(지도→나라상세→프로필→**실제 글 작성**→상세 확인→설정) 전부 통과. 새로 만든 게시물의 `id`를 DB에서 직접 조회해 `Crypto.randomUUID()`가 기존 `uuid.v4()`와 동일한 v4 포맷(소문자, 하이픈, 버전/variant 니블 정상)임을 확인 — 눈으로 보는 대신 SQL로 확정. 테스트 글은 확인 후 삭제.
  - Phase N: **친구 기능 킥오프 — 가시성 판정 통합 + RLS 보강 완료**(2026-07-20, 마이그레이션 `20260720100000_friend_kickoff_rls_hardening.sql`). 친구 UI 자체는 아직 없음 — 이번엔 DB 기반만.
    - **⛔ 차단 조건 해소**: `country_visits_select_visible`을 "본인 행은 무조건 통과 + 남의 행은 뷰어가 볼 수 있는 게시물이 그 나라에 하나라도 있어야 노출"로 재작성. 인덱스 추가 없음(기존 `posts_country_idx(country_code, user_id)`가 새 정책의 `exists` 서브쿼리에 그대로 맞아떨어짐 — `explain analyze`로 확인).
    - **`can_view_post(p posts, viewer uuid)` 함수 신설**: 기존 `posts_select_visible`의 조건을 문자 그대로 옮긴 것(케이스별 대조표로 동치 확인, 로직 변경 없음). `posts_select_visible`과 `country_visits_select_visible`이 이제 이 함수 하나를 공유 — 두 곳에 조건을 복붙하면 나중에 어긋날 위험을 원천 차단. `security invoker`(내부에서 참조하는 `profiles_select_all`이 이미 `using (true)`라 정의자 권한 불필요, `are_friends()`는 자체적으로 `security definer`).
    - **friendships RLS 구멍 2건 추가 발견 및 보강** (⛔ 작업과 무관하게 조사 중 발견): ① INSERT에 `status` 제약이 없어 `'accepted'`를 직접 넣어 상대 동의 없이 "이미 수락된" 관계를 혼자 만들 수 있었음 → `status='pending'`일 때만 INSERT 허용으로 수정. ② UPDATE가 당사자면 누구나 가능이라 요청자 본인이 자기 요청을 스스로 accepted로 바꿀 수 있었음 → USING에 "요청받은 쪽(비요청자)만 + 현재 pending"을, WITH CHECK에 "결과가 accepted"를 걸어 가능한 전환을 pending→accepted 하나로 제한(accepted 이후엔 UPDATE 자체가 안 되고 DELETE만). RLS만으론 "이전 행과 identical해야 함"을 표현할 수 없어서, UPDATE 시 `user_low`/`user_high`/`requested_by`/`created_at` 변조를 막는 `friendships_lock_identity` 트리거를 추가로 둠(G-1과 같은 "RLS로 못 거는 불변식은 트리거로" 패턴).
    - **검증 방법론**: `supabase db query`가 멀티스테이트먼트 스크립트에서 마지막 statement 결과만 돌려주는 걸 발견 → 각 시나리오 결과를 temp table에 적재했다가 마지막에 한 번에 조회하는 방식으로 우회(`scripts/verify-friends-rls.sql`, 롤백 트랜잭션 + `set local role authenticated` + `request.jwt.claims`로 특정 유저 흉내). INSERT 위반은 예외(`insufficient_privilege`)로, UPDATE의 USING 위반은 예외 없이 조용한 0행으로 끝난다는 차이를 발견해 판정 로직을 분리(전자는 예외 캐치, 후자는 `GET DIAGNOSTICS`로 영향 행 수 확인). 리허설(전체 rollback) → 실제 적용(`db push`) → 같은 스크립트로 라이브 재검증까지 2회 실행, 18개 시나리오(비공개/공개/본인 조회, friendships INSERT/UPDATE 구멍 차단, 수락 흐름, posts 가시성 매트릭스 3×3, `posts_country_idx` 사용 확인) 전부 통과 확인. 앱 쪽은 코드 변경이 없어 재빌드 없이 스모크(지도/나라상세/프로필/게시물상세)만 확인, 이상 없음.
  - Phase O: **🎉 친구 기능 UI — 전체 완료 (2026-07-22)**. 5단계 분할(화면 뼈대→검색+요청→수락/거절/끊기→통계 갱신→친구공개 칩 hidden 해제)로 진행, 단계마다 2계정 검증 통과 후 커밋 — 한 커밋에 여러 단계를 뭉치지 않는 원칙(문제 생겼을 때 되돌릴 단위 확보). 커밋: 1단계 `aaf97bc` / 2단계 `c60e917` / 3A `521cbb9` / 3B `f654d2c` / 4단계 `6ad2b35` / 5단계 `a633f78`.
    - **상태머신 (검색·목록 공용)**: 나와 상대 사이 관계를 `sortedPair(me, other)`(JS 문자열 `<` 비교, Postgres `least/greatest`·`are_friends()`와 동치)로 만든 `user_low`/`user_high`로 **단건 조회**해 `none`/`sent`(requested_by=me)/`received`(requested_by≠me)/`friends`(accepted) 4개로 분기. "요청 보내기"는 `none`일 때만 렌더돼 받은 pending에 재요청해 PK 충돌 나는 경로가 UI에 없음.
    - **⭐ 0행 자기교정 (이 기능의 핵심 방어)**: 수락/거절/끊기는 모두 `friendships`를 UPDATE/DELETE하는데, **RLS USING 위반은 에러가 아니라 "0행"으로 조용히 끝난다**(Phase N 검증 시나리오 7에서 확인). 그래서 `.update()/.delete()`에 항상 `.select()`를 붙여 영향 행 수를 확인하고, **0행이면 성공으로 취급하지 않고** 그 관계만 재조회해 실제 상태로 분기한다 — 상대가 그새 취소/끊음(관계 없음)이면 "조용히 목록에서 제거"(에러 배너 아님), 여전히 pending인데 막힌 경우(요청자 셀프수락 등)만 Alert. 목록에 stale 행이 남아 있어도 누르는 순간 이 경로가 실제 상태로 정리하므로 realtime 구독이 불필요(4단계 조사 결론).
    - **낙관적 vs 확인후 구분 (2026-07-22 확정)**: **가역적 액션(요청 취소·거절)** = 낙관적 제거 + 실패 시 원복(상대가 다시 보내면 그만이라 확인 다이얼로그 없음). **파괴적 액션(친구 끊기)** = ① 확인 다이얼로그 + ② 낙관적으로 지우지 않고 성공을 확인한 뒤 화면에서 제거(재수립에 상대 동의가 필요하고, 실패했는데 화면에서 사라져 있으면 "끊긴 줄 알았는데 아직 친구"라는 최악의 오해가 생김). 수락도 0행 재조회가 필요해 낙관적으로 처리하지 않음.
    - **거절·끊기 DELETE 통합**: `removeFriendship(otherId, expected)` — 대상 `status`(pending=거절/accepted=끊기)만 다른 같은 DELETE. `.eq('status', expected)`로 그새 상태가 바뀐 행을 엉뚱하게 지우는 걸 막는다.
    - **목록 로딩**: 두 탭(친구=accepted / 받은 요청=pending+requested_by≠me) 공용 `loadList`, `friendships` 조회 후 상대 프로필은 `profiles.in('id', otherIds)` **2차 쿼리로 병합**(user_low/high 어느 쪽이 상대인지가 행마다 달라 FK 조인이 안 맞음). `useFocusEffect` + `tab` 의존으로 포커스·탭 전환마다 재조회(Phase I 패턴), `listRequestIdRef`로 늦은 응답 무시. 실패=ErrorView+재시도, 빈 배열=빈 상태(에러 아님). 검색 결과 카드에서 액션하면 가려진 탭 목록도 `void loadList()`로 최신화.
    - **4단계(통계 포커스 갱신)**: 프로필 통계 3개(나라/기록/친구)를 `useEffect[userId]`→`useFocusEffect`로 이전(뱃지 pending count와 동일 패턴). 마운트 1회로 두면 탭이 계속 살아있어 친구 수락/끊기·글 작성/삭제 후 숫자가 앱 재시작 전까지 안 맞던 갭 해소 — 덤으로 "글 쓰고 프로필 돌아오면 기록 수 안 늘던" 기존 갭도 같이 해소. 포커스마다 도는 조회라 **실패 시 0으로 덮으면 오프라인 탭 왕복 시 숫자가 튀므로** 실패한 항목만 직전 값 유지(`setStats(prev => ...)`). realtime은 넣지 않기로 판단(위 0행 자기교정 + 포커스 재조회로 충분, 이 규모엔 과설계).
    - **5단계(친구공개 활성화)**: `VISIBILITY_OPTIONS`의 friends 항목 `hidden: true` 제거(공용 소스 한 곳 → compose·게시물 편집 양쪽 자동 3칩). hidden이 사라지며 무의미해진 `VisibilitySelector`의 필터(`!opt.hidden || opt.value === value`)와 타입의 `hidden?: boolean` 필드도 죽은 코드로 제거.
    - **이하 초기 2단계 상세(1·2단계, 착수 시점 기록 보존)**:
    - **1단계 완료(`aaf97bc`)**: `app/friends.tsx` 신설(최상위 라우트 — `app/_layout.tsx`의 `Stack.Screen`에 명시 등록 안 해도 `settings.tsx`/`post/[id].tsx`처럼 파일 기반 라우팅으로 자동 동작 확인됨). 헤더(뒤로가기+타이틀)+검색바(뼈대만)+세그먼트(친구/받은 요청)+탭별 빈 상태. 프로필 탭의 빈 `headerSpacer`를 👥 진입 버튼으로 교체, 받은 pending 요청 수를 **count 전용 쿼리**(`head: true`, 행 데이터 없음)로 조회해 dot 뱃지 — `useFocusEffect`(country/[cc].tsx와 동일 패턴)로 매 포커스마다 재조회해 친구 화면 다녀온 뒤 즉시 갱신됨.
    - **2단계 완료(`c60e917`)**: username 검색은 **정확 일치로 확정**(`pg_trgm`/검색 RPC 없이 `profiles.eq('username', q).neq('id', me)`만으로 충분 — citext라 대소문자 무시는 자동, `profiles_select_all` RLS가 `using (true)`라 추가 인프라 불필요). 검색바 placeholder+캡션에 "정확한 아이디로만 검색"을 항상 노출해 부분검색 기대와의 충돌을 방지.
      - **상태머신**: 매치된 상대와 나 사이 `friendships` 행을 `sortedPair(me, other)`(JS 문자열 `<` 비교 — 표준 소문자 정형 uuid 문자열이라 Postgres `least/greatest`와 동치, 초기 스키마의 `are_friends()`와 같은 규칙)로 만든 `user_low`/`user_high`로 **단건 조회**해 `none`/`sent`(`requested_by=me`)/`received`(`requested_by≠me`)/`friends`(`accepted`) 4개로 분기. "요청 보내기" 버튼은 `none`일 때만 렌더돼 **받은 pending에 재요청해 PK 충돌 나는 경로가 UI 구조상 존재하지 않음**(양방향 검색 대칭 검증 완료 — A가 보낸 요청을 B가 검색하면 B 화면엔 요청 보내기가 아니라 수락/거절이 뜸).
      - INSERT(요청 보내기)/DELETE(취소) 모두 **낙관적 업데이트 + 실패 시 원복**(Phase L과 동일 패턴). INSERT의 `23505`(unique_violation, 동시 양방향 요청 레이스)는 에러 배너 대신 관계를 재조회해 실제 상태로 갱신 — 코드 레벨 보장이라 타이밍 재현이 어려워 수동 시나리오 대신 리뷰로 확인.
      - (당시) 수락/거절/끊기는 자리만 두고 3단계에서 연결 예정이었음 — 위 3A/3B에서 완료.
  - Phase P: **🎉 좋아요 전체 완료 (2026-07-27)**. 게시물 상세에만 하트+개수. 2단계(데이터 계층 → 상세 UI)로 진행. 커밋: P-1 `d95d177` / P-2 `78a8afd`.
    - **RLS는 손대지 않음 (마이그레이션 0)**: 초기 스키마의 `post_likes_select_if_post_visible`/`post_likes_insert_self`가 `exists (select 1 from posts where posts.id = ...)`로 **posts 테이블 자체의 RLS(=`can_view_post`)에 얹혀간다** — "볼 수 없는 글의 좋아요는 조회·삽입 불가"가 DB에서 이미 강제됨. 이걸 이론이 아니라 **롤백 트랜잭션 6시나리오로 라이브 실증**(비공개/공개/친구공개 × SELECT/INSERT + 내 것만 DELETE): 비친구는 비공개·친구공개 글의 좋아요를 조회(0)·삽입(차단) 둘 다 막히고, 친구·공개는 허용, B가 A의 좋아요를 DELETE하면 0행. `scripts/verify-likes-rls.sql`로 박제(친구 하네스 패턴 재사용 — temp table + role/jwt.claims 스위칭). CLAUDE.md 규칙("가시성 조건을 **직접 다시 쓰는 새 정책**이 필요해지면 `can_view_post` 호출")은 새 정책을 안 써서 발동 안 함 — 검증된 `exists(posts…)` 형태 유지.
    - **카운트: count-on-read, 트리거·비정규화 컬럼 없음 (확정)**. 판단 기준 = "좋아요가 표시되는 화면이 한 번에 그리는 게시물 수". 좋아요 수를 **게시물 상세(글 1개)에서만** 보여주므로 매 조회 `count(*)`(복합 PK `(post_id,user_id)` 인덱스 히트) 한 번이면 충분 — G-1 스타일 카운터 트리거는 과설계. **그리드엔 개수 안 얹음**(인스타 그리드와 동일, 그리드/페이지네이션 코드 무변경). 좋아요한 사람 목록도 v1 제외(남의 프로필 보기가 v1.1이라 탭해도 갈 곳 없음).
    - **⭐ 백로그 — 카운트 승급 조건**: 나중에 탐색 피드(v1.2)나 그리드에 좋아요 수를 얹게 되면 그때 `posts.like_count` + G-1 스타일 카운터 트리거로 전환. **지금은 count-on-read.**
    - **`lib/likes.ts`**: `getLikeState(postId, userId)→{count, likedByMe}` (count는 `head:true count:'exact'`, likedByMe는 PK 점조회, **조회 에러는 throw**해서 호출부가 ErrorView 처리 — 조용한 실패 금지) / `setLike(postId, userId, liked)` **멱등** (liked면 INSERT·`23505`(PK 중복=이미 좋아요) 흡수 / unliked면 DELETE·0행=이미 없음 흡수, **진짜 에러만 throw** — 친구 기능 자기교정 패턴 재사용).
    - **`app/post/[id].tsx` 하트 UI**: 캐러셀 바로 아래 ♡/♥(active=빨강 `#ff3b30`)+개수, `getLikeState`를 기존 상세 조회에 병합(실패 시 전체 ErrorView+재시도). **낙관적 토글 + 400ms 디바운스 최종상태 쓰기**: 탭 즉시 반영 → 디바운스로 최종상태만 1회 씀. 표시 개수 = `serverCount + (pending≠server면 ±1)`로 항상 파생값 → 원복이 깔끔. 연타는 flush의 `while`로 최종상태 수렴(setLike 멱등이라 안전), 진짜 에러만 서버값 원복+Alert. **⚠️ 언마운트 cleanup에서 pending write 즉시 flush** — 타이머 대기 중(400ms 안) 뒤로가기하면 쓰기가 유실돼 "하트 눌렀는데 재진입 시 빈 하트"가 되는 걸 막음. 떠난 화면이라 flush 실패는 조용히(원복 대상 없음, 다음 진입 시 서버값이 진실). 순수 JS(supabase-js+state)라 새 네이티브 모듈 없음 — 핫리로드로 검증.
    - 검증: tsc 클린(기존 delete-account Deno 에러 제외), verify 스크립트 6시나리오 롤백 통과. 에뮬 2계정: 기본 토글/연타 최종상태 수렴/flush 유지(하트 누르고 즉시 뒤로가기 후 재진입 유지)/2계정 가시성/본인 글 좋아요/실패 원복 전부 통과. ⚠️ 2계정 가시성 테스트 시 주의: **계정 공개범위(`profiles.visibility`)를 현재 DB 상태에 의존하지 말 것 — 검증 시나리오 그룹 0에서 SQL로 명시적으로 세팅할 것.** 계정이 private이면 전체공개 글도 비친구에겐 안 보이는데(정상 동작), 어느 계정이 어떤 상태인지는 세션마다 바뀐다. (과거 이 자리에 "gp123은 private"이라고 적혀 있었으나 2026-07-31 기준 3계정 전부 public으로 확인됨 — 그래서 상태를 적어두는 대신 매번 못박는 방식으로 바꿈.)
  - Phase Q: **🎉 댓글 전체 완료 (2026-07-30 시작 → 2026-07-31 완료)**. 조사 결과 `comments` 테이블·RLS 4종이 초기 스키마에 이미 있었고 **드리프트 0**이라 "좋아요형(코드 중심) + 작은 하드닝 마이그레이션 1개"로 크기가 정해졌다. 커밋: Q-0 `bf983c2` / Q-1 `f1b69c0` / Q-2 `8188ec9` / Q-3 `d51512d`.
    - **Q-0 (커밋 `bf983c2`) — 프로필 확인 fail-closed (댓글과 별건, 먼저 청산)**: `context/auth.tsx`의 `checkProfile`이 `error`를 보지 않아 조회 실패 시 `data=null` → `hasProfile=false` → **프로필이 멀쩡히 있는 사용자가 온보딩으로 튀는** 버그. 비행기 모드 콜드스타트로 **재현 후 수정**(수정 전/후 대조 확인). Phase J의 username 중복확인 fail-closed와 같은 원칙.
      - `hasProfile: boolean | null` → `profileStatus: 'checking' | 'exists' | 'none' | 'error'`. 라우팅(`app/_layout.tsx`)은 `'error'`면 **어디로도 replace하지 않고** 전체화면 `ErrorView`+재시도를 렌더 — 스플래시는 이미 내린 뒤라 갇히지도 않는다(Phase K `fontError` fail-open과 같은 처리).
      - ⭐ **회귀 방어**: 마지막으로 확정된 판정을 `lastKnownRef`에 두고 조회 실패 시 그 값을 유지한다. 안 그러면 **앱을 쓰던 중 토큰 갱신이 실패했을 때 멀쩡한 사용자가 에러 화면으로 쫓겨난다.** `'error'`는 확정된 적 없는 콜드스타트에서만 나온다. 로그아웃 시 ref를 비워 다음 사용자가 이전 판정을 물려받지 않게 함. 같은 이유로 `onAuthStateChange`도 확정값이 없을 때만 `'checking'`으로 되돌린다.
    - **Q-1 — 하드닝 마이그레이션 (`20260730100000_comments_hardening.sql`)**: 가시성 정책(SELECT/INSERT/DELETE)은 **손대지 않음** — `exists(posts …)`로 posts RLS(=`can_view_post`)에 얹혀가는 것이 롤백 트랜잭션으로 실증됐고, 가시성 조건을 새로 쓰지 않으므로 "can_view_post 재사용" 규칙도 발동하지 않는다. 대신 검증에서 드러난 갭 4개만 메움:
      - ① `body` 길이 CHECK(`char_length(btrim(body)) between 1 and 500`) — 수정 전엔 10만자·공백만 INSERT가 전부 통과했다.
      - ② **대댓글 정합성 복합 FK** — 기존 단일 FK가 `post_id`를 안 봐서 **다른 글(볼 수 없는 글 포함)의 댓글을 부모로 지정한 INSERT가 통과**했다. `drop 단일FK → unique(id, post_id) → FK (parent_comment_id, post_id) references comments(id, post_id)` 3단계로 교체. `parent_comment_id`가 NULL이면 **MATCH SIMPLE** 규칙상 검사를 건너뛰어 최상위 댓글은 그대로 허용된다(이론이 아니라 INSERT로 실증함).
      - ③ `(post_id, created_at)` 인덱스로 교체(구 `comments_post_idx(post_id)`는 prefix로 완전 대체돼 drop).
      - ④ **UPDATE 정책 제거** — 아래 "댓글 수정 미지원" 참고.
      - **검증**: `scripts/verify-comments-rls.sql` — 리허설(DDL 인라인 + 전체 rollback) **32/32 OK** → `db push` → PART A만 주석 처리한 회귀 재실행 **25/25 OK, 리허설과 값 완전 동일**. 리허설 후 DB 무오염(행수·정책·인덱스·제약 전부 적용 전 상태)도 실사로 확인. 앱 스모크는 게시물 상세 진입(댓글 UI가 아직 없어 영향 표면 없음) 크래시 없음.
    - **Q-2 (커밋 `8188ec9`) — `lib/comments.ts` 데이터 계층**: 목록/개수/작성/삭제 + 입력검증을 한 파일로. 상세 설계는 아래 Q-3와 묶어서 정리.
    - **Q-3 (커밋 `d51512d`) — 게시물 상세 댓글 UI** (`app/post/[id].tsx`, +363줄). 설계 요약:
      - **목록 = 오래된 순 전체 로드(`limit 100`)**. 페이지네이션 없음 — 댓글이 붙는 화면이 게시물 상세 하나뿐이라 Phase P의 count-on-read와 같은 판단. **⭐ 승급 조건: 댓글 100개를 넘기는 글이 실제로 생기면** 그때 페이지네이션(또는 "더 보기")으로 전환할 것. 그래서 `commentCount`는 목록 길이가 아니라 **서버 기준 개수를 따로 조회**한다 — 상한을 넘으면 목록보다 큰 값이 나오고, 그게 승급 신호가 된다.
      - **작성자 프로필은 `profiles` 임베드로 1쿼리**(친구 목록처럼 2차 쿼리로 병합하지 않는다 — 댓글은 FK가 단일 방향이라 조인이 그대로 맞는다). PostgREST가 임베드를 **배열로도 객체로도** 돌려줄 수 있어 `normalizeAuthor`로 양쪽을 흡수 — 한쪽 모양만 가정하면 조용히 `undefined`가 된다.
      - **id를 클라이언트에서 생성**(`Crypto.randomUUID()`, Phase M에서 도입한 것 재사용)해 낙관적 항목과 INSERT가 **같은 id**를 쓴다 → 서버 응답이 와도 임시 id를 진짜 id로 갈아끼우는 스왑 로직이 아예 필요 없다. 실패하면 그 id로 걸러내 제거 + 카운트 원복.
      - **삭제는 "확인 후"**(낙관적으로 지우지 않음) + **0행 자기교정** — Phase O에서 확립한 파괴적 액션 규칙 그대로. 0행이면 성공으로 치지 않고 실제 상태로 정리한다.
      - **입력검증 2중 방어**: 앱이 `validateCommentBody`로 즉시 판정(빈 문자열/500자 초과)하고, **DB CHECK 위반도 같은 `CommentBodyRejectedError` 타입으로 수렴**시킨다 — 호출부가 "앱이 걸렀나 DB가 걸렀나"를 분기할 필요 없이 한 갈래로 처리된다. Q-1의 `body` CHECK가 최종 방어선.
      - **댓글 조회 실패는 전체 ErrorView로 막지 않는다** — 사진·글은 이미 볼 수 있으므로 댓글 영역만 재시도 가능한 에러로 표시(좋아요와 다른 선택, 근거는 코드 주석에도 남김).
      - **검증(에뮬 2계정)**: A·B·D·E(기본동작·입력검증·레이스·키보드) / C1 타계정 댓글 / C2 비공개 시 딥링크 차단(**댓글 섹션 자체가 렌더되지 않음**) / C3 친구 맺으면 열림 / C5 남의 댓글엔 삭제 버튼 없음(대조 확인) 전부 통과. 검증 후 DB 기준선 복구 — ⚠️ **당시 복구 문구에 `post_likes`가 빠져 있어 좋아요 2행이 3주간 남아 있었다**(2026-08-16 정리). 기준선의 정본은 "권한/가시성 모델" 섹션의 **⭐ 검증 기준선 / 검증 후 정리 체크리스트**를 볼 것 — 여기에 다시 적지 말 것.
  - Phase S: **한국 시군구 색칠 (조사 완료 2026-07-31, 진행 중)**. 세계는 나라 단위 유지, **한국만 시군구 단위로 세분**. 지도 색칠은 진입점이라는 제품 정의는 그대로.
    - ⚠️⚠️ **229 함정 — 개수 일치를 검증으로 삼지 말 것 (2026-08-16 실측)**: OSM `admin_level=6`은 **정확히 229개**가 나오지만, **우리가 아는 229와 구성이 다르다.**
      - 실측 구성: `229 = 시 77 + 군 82 + 구 70` = **자치시군구 227**(2026-07-01 인천 개편 반영) + **제주 행정시 2**(제주시·서귀포시) + **세종 0**
      - 표준 229의 구성: `226 자치 + 제주 행정시 2 + 세종 1`
      - **숫자만 같고 내용이 다르다.** S-0에서 250 vs 229로 데인 것과 정확히 같은 함정이니, "229개 나왔으니 맞다"로 넘어가지 말고 **구성(시/군/구 내역·세종 유무)을 대조**할 것.
      - **⭐ 세종특별자치시는 `admin_level=6`에 없다 — `admin_level=4`에 있다**(Nominatim 교차확인: relation 2349795, `ref:KR:mois:admin=3600000000;3611000000` 세미콜론 2값). **레벨 4에서 따로 가져와 병합하지 않으면 지도에 세종 크기의 구멍이 생긴다.** S-2 필수 항목.
    - **전제 재확인**: 과거 `city_visits`를 걷어낸 이유는 "전 세계를 도시 단위로"가 무리였던 것 — 커밋 `87f9b33`("Replace city_visits with country_visits")과 `e7b5de5` 마이그레이션 주석("cities 테이블이 거의 비어 있어 v1에서 도시 선택을 강제할 수 없다")으로 교차확인. **한국 229개로 좁히면 해소되는 문제**라 재조사 불필요.
    - **⭐ 현행 구조에서 나온 핵심 제약 3가지 (조사로 확인)**:
      - **나라 판정은 서버가 아니라 클라이언트다** — `lib/countryFromCoord.ts`가 번들 `countries.json`에 turf point-in-polygon을 돌려 `posts.country_code`를 채운다. **G-1 트리거는 판정을 하지 않고** 앱이 넣은 값을 읽어 `country_visits`를 동기화만 한다. 즉 서버가 좌표↔나라 정합성을 검증한 적이 없다.
      - **PostGIS는 이미 켜져 있다** (라이브 실사: `postgis 3.3.7`, `posts.location = geography(Point,4326)`, SRID 4326) — 시군구 판정을 서버(`ST_Covers`)로 옮길 인프라는 준비돼 있다.
      - **지도에 타일 벤더가 없다** — `MAP_STYLE`은 `sources: {}` + 배경색 레이어 하나뿐(`app/(tabs)/index.tsx`)이고 모든 지오메트리가 번들 GeoJSON(`countries.json`, 284KB/242피처)에서 온다. 색칠도 feature-state가 아니라 `fill-color`의 `['match',['get','cc'],…]`. **줌인해도 나타날 하위 경계가 애초에 없다** — 시군구는 새 소스를 통째로 얹는 작업이고, 번들이냐 원격이냐가 APK 크기 문제로 직결된다.
    - **⭐⭐ 경계 데이터 확정 = OSM (2026-08-16, 정부 포털 → OSM 전환)**:
      - **확정 소스: OpenStreetMap `boundary=administrative` + `admin_level=6` (229개) + 세종은 `admin_level=4`에서 별도 추출. 라이선스 ODbL 1.0.**
      - **전환 이유**: 정부 포털에서 막힌 것은 **라이선스가 아니라 배포 절차**였다. 한국 시군구 색칠은 이미 여러 상용 서비스가 하고 있고 대개 OSM 계열을 쓴다. OSM은 **계정 불필요·해외 IP에서 즉시 다운로드 가능**(2026-08-16 미국 IP에서 실제 성공 — vworld가 2주간 502였던 것과 대비).
      - **❌ `15125064` (센서스경계 시군구) 탈락**: 포털 메타데이터는 "제한 없음"이었으나 **실제 배포처 약관이 CC BY-NC-ND**였다. **변경금지가 결정타** — 우리는 단순화·좌표변환·DB적재를 전부 하므로 그 자체가 변형이다. (라이선스 원칙 섹션의 "포털 메타와 배포처 약관이 다를 수 있다" 경고가 두 번째로 적중한 사례.)
      - **⚠️ `15059910` (국토지리정보원 기본공간정보) — 라이선스는 통과, 절차로 탈락**: 공공누리 **제1유형**이라 상업·변형 모두 가능하지만 **국토정보플랫폼 로그인 + 대용량 전송 전용 S/W + 영역 신청** 절차라 즉시 확보 불가. 폐기가 아니라 **보류** — OSM에 문제가 생기면 돌아올 안전판이다.
      - **확보 경로 (2026-08-16 실측)**:
        - **1순위: Overpass API** — 계정 불필요, 필요한 229개만, **태그가 원본 그대로 보존된다**(아래 `ref:KR:mois:admin`이 핵심이라 이게 결정적). ⚠️ **불안정**: 같은 날 count 5초·태그 CSV 8초로 성공했지만 `[out:json]` 출력과 일부 쿼리는 양쪽 인스턴스(`overpass-api.de`, `kumi.systems`)에서 반복 504. rate limit IP당 2슬롯. **시도별 17분할**로 나눠 받을 것.
        - **2순위(백업): Geofabrik `south-korea-latest.osm.pbf`** — 계정 불필요, 272MB, 매일 갱신. Overpass 504가 반복되면 이걸 받아 로컬 처리로 전환한다. 연 1회 갱신 시 재현성은 이쪽이 더 좋다.
        - **❌ Geofabrik free shp (`-free.shp.zip`, 551MB) 제외**: zip 중앙 디렉터리를 range 요청으로 직접 확인한 결과 `gis_osm_adminareas_a_free_1` 레이어는 **있다**. 다만 Geofabrik free 셰이프파일은 **속성이 축소**돼 `ref:KR:mois:*` 태그가 보존되는지 불확실 — 코드 태그가 날아가면 식별자 설계의 절반이 무너지므로 후보에서 뺀다.
        - **❌ osm-boundaries.com 제외**: *"To download data you must be authenticated via OpenStreetMap.org"* — OSM 계정 OAuth 로그인 + 무료체험/유료 플랜. **정부 포털 절차를 피하려던 이번 전환의 취지와 어긋난다.**
      - **⭐ 최신성 검증 통과 (실측)**: **군위군 = `2772000000`** → 앞 2자리 `27` = 대구광역시, **2023-07-01 대구 편입 반영됨**(geoBoundaries가 2020년 기준이라 탈락했던 바로 그 항목). 대구 9개(7구+달성+군위)·경북 22개로 정합. **인천 2026-07-01 개편도 시행 6주 만에 반영**(중구·동구·서구 소멸 → 제물포구·영종구·서해구·검단구 신설).
        - ⚠️ **`서해구`는 오타나 오류가 아니다** — 2026-07-01 인천 개편으로 기존 서구가 **서해구 + 검단구**로 분리된 실제 확정 명칭이다. 조사 중 `boundary=historic`인 동명 relation(2505210)도 따로 있어 혼동했으니 주의.
      - **제외 확정**: GADM(*"Redistribution or commercial use is not allowed without prior permission."*) / 국가공간정보포털 오픈마켓(**CC BY-NC-ND**) / SGIS 직접(약관상 상업 이용 제한 + 회원가입·자료신청) / `15125055` (센서스경계)**행정동**경계(**제4유형**) / southkorea-maps(GADM 혼입 + KOSTAT분 2013년).
      - ⚠️ **geoBoundaries KOR ADM2는 편해 보이지만 쓰지 말 것**: 229개로 시군구와 수는 맞지만 ① API 메타의 라이선스가 사이트 표기(CC BY 4.0)와 달리 **CC BY 3.0** ② `licenseSource`가 **citypopulation.de**인데 그쪽 약관은 상업 이용 허용을 **인구 데이터**에 한정하고 *"The maps and other geospatial data are under the copyright of »City Population«…"*로 **지리공간 데이터를 따로 못박음** ③ `boundaryYearRepresented: 2020`이라 **군위군 개편(2023-07-01) 이전**.
      - ⚠️ **검색 상위에 뜬다고 살아있는 데이터가 아니다**: "시군구 경계" 주력 데이터셋 2개(`15125045`, `15062309`)는 접속 시 `alert('해당 데이터는 폐기되었습니다.')`를 반환한다. **착수 전 폐기 여부부터 확인할 것.**
      - ⚠️ **같은 기관·같은 등록일이어도 단위별로 라이선스가 갈린다** — 위 시군구("제한 없음") vs 행정동(제4유형)이 실제 사례. "국토부 것이니 되겠지"는 위험.
    - **⭐⭐ ODbL 의무 3개와 충족 방법 (2026-08-16 조문 검증 완료 — 사용자가 원문 재확인)**:
      - **❌ 폐기된 전제: "가공 데이터를 별도 배포하지 않으면 share-alike를 회피할 수 있다"** — 틀렸다. 조문 **4.4(c)** 가 그 우회로를 명시적으로 막는다: *"A Derivative Database is Publicly Used and so must comply with Section 4.4 **if a Produced Work created from the Derivative Database is Publicly Used**."* 즉 **렌더된 지도(Produced Work)만 공개해도** 그 뒤의 가공 경계 DB가 "공개 사용된" 것으로 간주된다. 게다가 우리는 GeoJSON을 **APK에 번들**하므로 4.4(c)를 따질 것도 없이 지오메트리 데이터 자체를 배포한다. **이 전제로 설계를 시작하지 말 것 — 이미 한 번 틀렸던 지점이다.**
      - 우리 행위의 ODbL 분류: 경계 추출→단순화→PostGIS 적재→GeoJSON 번들 = **Derivative Database 생성 + 배포** / 앱 화면의 색칠 지도 = **Produced Work**. (3.1에 상업 이용 명시 — 상업성 자체는 문제없음.)
      - **의무 ①(4.4a)** 그 경계 DB는 ODbL 또는 호환 라이선스로만 배포 / **②(4.6)** 수령인에게 파생 DB 전체 또는 변경분 파일을 **기계판독 형태·인터넷 배포 시 무상**으로 제공하겠다고 offer / **③(4.2·4.3)** 데이터와 문서에 라이선스 사본 또는 URI 포함 + 저작권 고지 유지, Produced Work에 출처 고지.
      - **충족 방법 (✅ 2026-08-16 이행 완료)**: 경계 파일을 public repo(`26-park/colormap`)의 **`data/kr-sgg/`** 에 ODbL 고지와 함께 커밋 → repo 자체가 "무상 기계판독 제공"이 되어 **4.2와 4.6이 동시에 충족**된다. 별도 배포 인프라 불필요. **고지 원문은 `data/kr-sgg/README.md`** (추출일·Overpass 쿼리·ODbL URI·저작권 고지 포함).
      - **⛔ 차단 조건 — 이 충족은 "repo가 public"에 전적으로 의존한다**: 저장소를 **private으로 전환하면 그 순간 4.6 위반**이 되고, 경계 파일을 받을 별도 공개 경로를 반드시 따로 마련해야 한다. **잊히기 매우 쉬운 조건이라 차단 조건으로 박아둔다** — repo 공개범위를 건드리는 작업을 할 때 이 항목을 먼저 볼 것.
      - **앱 출처표시**: **설정 → "지도 데이터 출처"** 항목에 `지도 데이터 © OpenStreetMap contributors, ODbL 1.0` + `https://www.openstreetmap.org/copyright` 링크 + ODbL URI. 배치 규칙은 앱에 관대하다(가이드라인이 *"If attribution is presented to the user upon application startup, it does not need to be presented ... every time"* 이라 명시, 메뉴/크레딧 화면도 허용) — 기존 계획대로 설정 화면 한 곳이면 충족. 구현은 S-5/S-6 범위.
      - **⭐ `posts`는 share-alike와 무관하다**: 게시물이 **surrogate id로 참조만** 하고 OSM 콘텐츠를 담지 않으므로 OSMF **Collective Database Guideline**의 식당 전화번호 예시에 그대로 해당한다(*"Your phone numbers are not subject to share-alike"*). **⚠️ 단 같은 가이드라인이 반례로 "중복 제거하며 병합"을 든다 — `posts`에 OSM 속성값(시군구 이름 등)을 복사해 넣는 순간 이 보호가 깨질 수 있다. FK만 두는 설계가 곧 라이선스 방화벽이다.**
    - **⭐ 시군구 식별자 — 코드 단독은 안전하지 않다 (확정)**: 행정구역 개편 시 **5자리 코드 자체가 바뀐다** — 군위군 대구 편입(2023-07-01)으로 `47720`(경북) → `27720`(대구). 앞 2자리가 시도라 편입되면 따라 바뀐다. 이름도 불가(**실측 중복: 중구 5, 동구 5, 서구 4, 북구 4, 남구 4, 강서구 2, 고성군 2**). → **자체 surrogate id를 PK로 두고 `sgg_code`(5자리)·이름은 속성 컬럼으로.** 방문 기록은 surrogate를 참조하므로 코드가 바뀌어도 기록이 안 깨지고, 개편 시 매핑 테이블만 갱신하면 된다(229개 규모라 `valid_from`/`valid_to` 이력도 부담 없음). **코드를 자연키로 쓰면 편입 때마다 방문 기록 FK를 손대야 한다.**
    - **⭐ 코드 태그는 `ref`가 아니라 `ref:KR:mois:admin` (2026-08-16 실측 — 헷갈리기 쉬움)**:
      - **`ref`는 쓸모없다** — 서울 25개 자치구에만 `01`~`25` 형태로 붙어 있다(25/229). 이걸 보고 "OSM엔 코드가 없다"고 결론내면 오판이다.
      - **`ref:KR:mois:admin`(행정안전부 코드, 10자리)이 진짜다 — 220/229(96%) 보유, 중복 0.** **앞 5자리가 우리가 쓸 `sgg_code`** (예: `2772000000` → `27720`). 함께 붙어 있는 태그: `ref:KR:mois:legal`(법정동코드), `ref:KR:mods:kadc`.
      - **결측 9개**: **울산 5개**(중·남·동·북구, 울주군) = 알려진 값이라 **수기 보정** / **인천 신설 4개**(영종·제물포·검단·서해구) = **MOIS 신규 고시 확인 후 보정**.
      - **⚠️ `sgg_code`를 NOT NULL로 잡지 말 것** — 신설 구는 코드 부여 전 기간이 실재한다(지금 인천 4개가 그 상태). **결측을 허용하되 surrogate id는 발급**해 나중에 코드만 채울 수 있게 한다.
      - **`osm_relation_id`를 별도 컬럼으로 보관할 것** — 연 1회 갱신 시 매칭 키가 되고, 코드가 없는 9개도 이걸로 추적된다.
    - **S-2 추출·검증 완료 (2026-08-16)** — 산출물은 아직 스크래치패드에 있고 repo 커밋 전이다.
      - **추출**: Overpass `rel(id:...)` 10개씩 23배치 + `out geom;`. **단순 재시도만으로 전부 성공**(최대 4회) — pbf 전환 불필요했다. 총 14MB XML.
      - **⚠️⚠️ 미러 스냅샷 혼입 사고 (반드시 기억)**: 재시도 시 `overpass-api.de` ↔ `kumi.systems`를 번갈아 쓰게 짰더니, **미러가 요청마다 제각각인 옛 스냅샷(2026-05-06 / 05-31 / 07-15)을 돌려줬다.** 그 결과 20개 시군구에서 **최근 추가된 `ref:KR:mois:admin` 태그가 통째로 사라진** 채 수집됐다(220 → 201). **인접 폴리곤이 서로 다른 스냅샷에서 오면 공유 경계가 어긋나 틈이 생긴다.** → **경계 데이터 수집은 절대 여러 인스턴스를 섞지 말 것. 단일 엔드포인트로 고정하고, 각 응답의 `<meta osm_base>`가 전부 같은지 반드시 검사할 것.** (미러 4배치를 본서버로 재수집해 전부 `2026-08-17`로 통일 후 해결.)
      - **조립**: 순수 파이썬(`assemble.py`) — 멤버 way를 role별로 이어붙여 링 생성 후 inner를 포함 outer에 hole로 배정. **열린 링 0, 누락 0, 230/230.** GIS 툴체인(ogr2ogr/osmium/shapely) 없이 처리됨.
      - **조립 정확성 검증**: 내륙 시군구 면적이 실제값과 일치 — 부산진구 29.5(실제 29.7) / 종로구 23.8(23.9) / 강남구 40.1(39.5) / 청주시 934.8(940.3) km².
      - **⭐ 미세 파트는 버그가 아니라 실제 월경지다**: 부산진구 조각이 동구 안에, 남동구 조각이 연수구 안에, 군산시 조각 2개가 부안군 안에 있다(면적·홀이 정확히 짝을 이룸, 400~11,400m²). **단순화하면 이 조각들이 사라진다**(파트 240→235, 홀 5→0). 색칠 지도에선 보이지도 않는 크기라 수용했지만, **"파트 수가 줄었다"를 버그로 오인하지 말 것.**
      - **⚠️⚠️ OSM 시군구 경계는 해상 경계를 포함한다**: 전체 면적 합이 **179,728km²로 남한 국토(약 100,400km²)의 1.8배**다. 내륙은 정확한데 연안 시군구가 바다까지 뻗는다 — 연수구 143.6(육지 55) / 부안군 1,856(육지 493) / 군산시 4,162(육지 396) km².
      - **⭐⭐ 해안선 방침 확정 (2026-08-16) — 클리핑은 렌더링에만, 판정은 미클립**:
        - **PostGIS 적재본 = 미클립(`sgg_kr_raw.geojson`)**. 해변·부두·선상에서 찍은 좌표가 `sgg_id` NULL로 떨어지면 안 되고, **바다를 포함하는 것이 행정적으로도 옳다**(관할 해역은 실제로 그 시군구 소관).
        - **APK 번들본 = 클립 + 단순화**. 그대로 칠하면 바다가 칠해져 지도가 망가진다. 작업은 **S-5(지도 렌더링) 범위**.
        - **⚠️ 순서는 "클립 → 단순화"**. 클립하면 해안선을 따라 정점이 늘어나므로 **클립 후에 단순화하고 용량을 다시 측정할 것** — 지금 측정한 629KB(10%)는 **미클립 기준이라 클립 후엔 달라진다.**
        - **클립 소스 = OSM 파생 land polygons (`osmdata.openstreetmap.de`)**. 같은 ODbL이고 경계와 **같은 소스라 정합이 맞는다**. ❌ **Natural Earth 50m(`countries.json`)는 클립 소스로 부적합** — 해상도가 시군구 경계보다 훨씬 거칠고 소스가 달라 해안선이 어긋난다.
      - **단순화 = mapshaper `-simplify visvalingam N% keep-shapes`** (npx로 실행, 설치 불필요). **per-polygon 단순화를 쓰면 인접 시군구 사이에 틈이 생기므로 반드시 공유 arc를 유지하는 mapshaper를 쓸 것.**
        | 레벨 | 크기 | gzip | 좌표수 | 최대 개별 면적오차 |
        |---|---|---|---|---|
        | raw | 7.28MB | 2.09MB | 269,912 | — |
        | 20% | 1.19MB | 323KB | 54,847 | 0.60% |
        | **10%** | **629KB** | **162KB** | 28,030 | **2.0%** |
        | 5% | 351KB | 85KB | 14,679 | 7.1% |
        | 3% | 241KB | 56KB | 9,361 | 31.7% |
        - 비교 기준: 현행 `countries.json` = 284KB / gzip 107KB / 13,805점 / 242피처(전 세계).
        - **⭐ 권장 10%** — 오차가 큰 쪽은 항상 **작은 도심 자치구**(서울 중구 4.1km²)라 총면적이 아니라 **이 최소 단위가 판정 기준**이다. 3%에서 서울 중구가 31.7% 깎여 탈락. 용량이 문제되면 5%(최대 7.1%)까지가 한계선.
      - **코드 보정 결과**: `ref:KR:mois:admin` 보유 **226/230**, 중복 0. 울산 5개는 **osm_id로 못박아** 수기 보정(`31110`중구/`31140`남구/`31170`동구/`31200`북구/`31710`울주군 — 이름 중복 때문에 이름으로 매칭하면 위험)하고 `code_source='manual'`로 표시.
      - **⏸️ 인천 신설 4개(제물포·영종·서해·검단) 코드는 보류 확정 (2026-08-16)**: MOIS 고시 코드를 못 찾아 `sgg_code=null`로 둔다. **surrogate id 설계라 아무것도 막지 않는다** — 결측 상태로 S-3 이후를 그대로 진행하고, 나중에 [행정표준코드관리시스템](https://www.code.go.kr/stdcode/regCodeL.do)에서 확인해 채운다. **추측한 코드를 넣지 말 것(틀린 코드가 NULL보다 나쁘다).** 그래서 `sgg_code`는 NOT NULL이면 안 된다.
      - **커밋 산출물** (`data/kr-sgg/`): `sgg_kr_raw.geojson`(7.3MB, **판정용 원본·미클립**) / `sgg_kr_render.geojson`(718KB, **렌더링용·클립+3% 단순화**, S-5a에서 추가) / `extract.py`·`clip.py`(재현 스크립트) / `load_to_db.py` / `README.md`(**ODbL 고지 = 4.2+4.6 충족 지점**). ⚠️ 앱 번들용이 아니므로 `assets/`가 아니라 `data/`에 둔다(Metro 번들 오염 방지).
    - **S-3 완료 (2026-08-16, 마이그레이션 `20260816100000_sgg_boundaries.sql`)** — 경계 테이블 + `posts.sgg_id` + 서버측 판정 트리거.
      - **`sgg` 테이블**: `id`(uuid surrogate PK) / `osm_relation_id`(unique, **갱신 시 매칭 키**) / `sgg_code`(char(5), **nullable**) / `name` / `admin_level`(4 또는 6) / `code_source`(`osm`|`manual`|null) / `geom`(**geography(MultiPolygon,4326), 미클립 원본**). 인덱스 = GIST(geom) + `sgg_code` 부분 unique(`where sgg_code is not null` — 코드 없는 4행이 서로 충돌하면 안 되므로).
      - **RLS**: `sgg_select_all using(true)` + `grant select to authenticated`만. **쓰기 정책을 아예 만들지 않는 것으로 앱의 쓰기를 차단**한다(검증 C2/C3로 실증).
      - **⭐ 시군구 판정은 나라와 달리 서버가 한다**: `set_post_sgg()`(BEFORE INSERT OR UPDATE, `security invoker`)가 `st_covers`로 계산해 **앱이 넣은 `sgg_id`를 항상 덮어쓴다.** `country_code`를 조건으로 쓰지 않는 이유 = country_code 자체가 클라이언트 파생값이라 신뢰할 수 없고, `sgg`에 한국 경계만 있으므로 국외 좌표는 자연히 매칭 0건 → null이 된다.
        - **⚠️ 트리거를 `update of location`으로 한정하지 않았다** — 그러면 캡션만 바꾸는 UPDATE에 `sgg_id`를 실어 보내 값을 심을 수 있다(검증 B4가 이걸 본다).
      - **적재**: `data/kr-sgg/load_to_db.py` — `osm_relation_id` 기준 **upsert라 멱등**이고 surrogate id가 보존돼 기존 `posts.sgg_id`가 끊기지 않는다. 7.3MB라 5개씩 46청크로 쪼개 보낸다(Management API 요청 크기 한계). 마지막에 backfill UPDATE까지 수행.
      - **검증**: `scripts/verify-s3-sgg.sql` — 리허설(PART A 인라인 + 전체 rollback) **20/20 OK** → rollback 무오염 확인 → `db push` → 적재 → 회귀 **20/20 OK**.
        - ⚠️⚠️ **합성 경계는 반드시 한국에서 먼 태평양(160E/0N)에 둘 것.** 처음엔 서울 근처(126~129E)에 뒀는데, 실제 230행 적재 후 회귀 실행에서 **합성 사각형이 진짜 시군구(영종구·평창군)와 겹쳐 5개 항목이 오탐으로 깨졌다.** 트리거가 `limit 1`이라 겹치면 어느 쪽이 잡힐지 알 수 없다.
      - **⭐ 실데이터 검증 결과**:
        - 230행 적재, 코드 226, 세종 1, 수기보정 5, **`st_isvalid` 무효 지오메트리 0건**(순수 파이썬 링 조립이 유효한 폴리곤을 만들었다는 뜻).
        - **겹침 0건** — 한국 bbox 랜덤 3000점 샘플에서 `max_hits=1`(1502점 1개 매칭 / 1498점 0개). 실제 시군구는 공간을 분할하므로 `limit 1`이 결정적이다. **⚠️ 단 이 성질은 "`sgg`에 세종만 level 4로 들어있다"에 의존한다 — 다른 시도를 level 4로 추가하면 level 6와 겹쳐 중복 판정이 생긴다.**
        - **backfill**: 기존 7건 중 한국 4건만 판정됨(AU/JP/TH는 null). **Nominatim 역지오코딩과 4/4 정확히 일치** — 의성군·예천군·충주시·구례군.
    - **⚠️⚠️ 갱신 리스크 — 전남·광주 통합 (2026-08-16 발견, 격상됨)**: S-3 backfill 교차검증 중 Nominatim이 구례군의 상위를 **"전남광주통합특별시"**로 표기하는 것을 발견했다. 전남·광주 통합이 이미 OSM에 반영돼 있다는 뜻이다.
      - **군위군(`47720`→`27720`)과 같은 유형이지만 규모가 다르다.** 군위군은 1개였지만, 통합되면 **광주 5개 자치구 + 전남 22개 시군, 최대 27개의 `sgg_code` 앞 2자리(`29`/`46`)가 한꺼번에 바뀔 수 있다.**
      - **✅ 방문 기록은 안전하다** — `sgg.id`(surrogate)를 참조하고 `osm_relation_id`로 매칭하므로, 코드가 바뀌어도 `posts.sgg_id`/시군구 방문 기록이 깨지지 않는다. 이 설계가 정확히 이 경우를 위한 것이다.
      - **⚠️ 다만 `sgg_code` 재매핑 절차는 필요하다.** 코드가 낡은 채로 남으면 외부 데이터(통계·행정 API)와 조인할 때 어긋난다.
      - **⭐ 갱신 원칙 (못박음)**: **경계를 다시 받을 때는 `osm_relation_id`로 매칭하고 `sgg_code`는 항상 재조회해 덮어쓴다.** `sgg_code`를 매칭 키로 쓰지 말 것 — 바뀌는 값이라 매칭이 어긋난다. `load_to_db.py`의 upsert가 이미 이 형태다(`on conflict (osm_relation_id) do update set sgg_code = excluded.sgg_code, ...`).
      - 통합이 실제 시행되면 **`code_source='manual'`인 울산 5개도 같이 재확인**할 것(수기 값이라 자동으로 갱신되지 않는다).
      - **⚠️ `sgg_visits.sgg_id`는 CASCADE다 — 경계 갱신으로 `sgg` 행이 삭제되면 사용자의 색칠 기록도 함께 소멸한다.** 통폐합 시 방문 기록을 후신 시군구로 **이관하는 절차가 필요**하다(사용자가 고른 색 보존). `posts.sgg_id`는 SET NULL이라 글 자체는 안전하다 — 두 FK의 동작이 의도적으로 다르다는 점을 기억할 것.
    - **S-4 완료 (2026-08-16, 마이그레이션 `20260816110000_sgg_visits.sql` + `20260816110001_sgg_visits_backfill.sql`)** — 시군구 방문 테이블 + RLS + 동기화 트리거.
      - **`sgg_visits`**: `id` / `user_id`(→profiles CASCADE) / `sgg_id`(→sgg **CASCADE**) / `color`(default `#ff6a2b`) / `unique(user_id, sgg_id)`. **`country_visits`의 실제 정책을 DB에서 읽어 그대로 옮겼다 — 새로 발명하지 않았다.**
      - **RLS 4종**: SELECT = `user_id = auth.uid() or exists(posts p where p.sgg_id=… and p.user_id=… and can_view_post(p.*, auth.uid()))` / INSERT·UPDATE = `user_id = auth.uid()` + "그 시군구에 내 글이 있어야" exists / DELETE = 본인.
      - **트리거** `sync_sgg_visit_on_post_change()`(AFTER INSERT/UPDATE/DELETE, `security invoker`) — G-1 함수를 `country_code`→`sgg_id`로 치환하고 **`sgg_id is not null` 가드만 추가**(국외 글 건너뜀). ⚠️ **AFTER 인 이유**: BEFORE 트리거 `posts_set_sgg`가 `sgg_id`를 계산한 뒤에 읽어야 한다.
      - **⚠️ backfill이 별도 마이그레이션인 이유 (놓치기 쉬운 함정)**: 트리거는 **이후의** posts 변경에만 반응한다. S-3에서 `posts.sgg_id`를 채운 시점엔 이 트리거가 없었으므로 **기존 4건은 방문 행이 0개였다**(회귀 통과 후 별도로 발견). 멱등한 `insert … select distinct … on conflict do nothing`으로 보정 — 결과 4행(충주시/구례군/의성군/예천군, gp123).
      - **검증**: `scripts/verify-s4-sgg-visits.sql` — 리허설 **20/20 OK** → 무오염 확인 → `db push` → 회귀 **20/20 OK**. 대상 좌표는 하드코딩하지 않고 `ST_PointOnSurface(geom)`으로 "반드시 그 안에 있는 점"을 뽑는다. 계정 공개범위는 시작 시 SQL로 명시 세팅(Phase P 규칙).
      - **⭐⭐ B1 존재 증명 — 반증 3단 비교 (실측)**: "비공개 글만 있는 종로구를 비친구가 볼 때"
        | 정책 형태 | 비친구가 보는 행수 |
        |---|---|
        | ⛔ `using (true)` — **Phase N 이전 형태** | **1 (누출)** |
        | `exists(posts …)`, `can_view_post` 없음 | 0 |
        | ✅ 우리 정책 (`can_view_post` 경유) | 0 |
        - **`exists(posts …)` 서브쿼리는 그 자체로 posts RLS를 탄다 — `post_likes`, `comments`에 이어 `sgg_visits`에서 세 번째로 실측 확인. `can_view_post` 명시 호출은 이중 방어이자, posts 정책 변경 시 영향 범위를 grep으로 추적 가능하게 하는 장치.**
        - ⚠️ 그러므로 **"`can_view_post`를 안 부르면 샌다"고 오해하지 말 것.** 실제로 새는 형태는 **posts 조건 자체가 없는 정책**이다(Phase N 이전의 `country_visits`가 그랬다).
    - **S-5a 완료 (2026-08-17)** — 해안선 클립 + 3% 재단순화. 앱 코드 변경 없음, 산출물은 `data/kr-sgg/sgg_kr_render.geojson`(718KB). 상세는 `data/kr-sgg/README.md`가 정본.
      - **클립 소스**: OSM land polygons(`land-polygons-complete-4326`, 920MB, ODbL) — 경계와 같은 소스라 정합이 맞는다.
      - **⭐ 920MB를 메모리에 안 올리는 방법**: 셰이프파일은 **폴리곤 레코드마다 bbox를 저장**하므로 `pyshp`로 스트리밍하며 한국 bbox에 걸치는 것만 고르면 된다(83만 중 17,696개, 51초). **GDAL/ogr2ogr 없이 처리된다** — 이 PC엔 GDAL이 없어서 이게 결정적이었다. 육지 union은 4분이라 `land_kr_union.wkb`로 캐시.
      - **빌드타임 의존성**: `pip install pyshp shapely`. **앱 의존성이 아니다(`package.json` 무관).**
      - **⚠️ 클립하면 정점이 는다 — S-2 기준이 무너졌다**: 좌표 269,912 → 785,759(2.9배), 파트 240 → 4,262(섬이 개별 폴리곤이 됨). **"10% = 629KB"였던 것이 클립 후 2.10MB.** 순서는 반드시 **클립 → 단순화**이고, 클립본 기준으로 용량을 다시 재야 한다.
      - **⚠️ 판정 기준도 바뀐다**: 클립 전엔 작은 도심 자치구(서울 중구)가 먼저 무너졌는데(3%에서 31.7%), 클립 후엔 3%에서도 ≤1.4%다(전체 좌표가 3배라 같은 %가 덜 공격적). 대신 **군도의 섬 손실**(신안군 792섬)이 새 제약 — `keep-shapes`는 피처 소멸만 막고 개별 파트는 못 지킨다.
      - **면적 검증**: 총합 179,728 → **100,703km²**(남한 국토 약 100,400, 오차 0.3%). 230개 유지, 빈 결과 0, 열린 링 0. 내륙은 한 좌표도 안 건드려짐(부산진구 29.5 그대로).
      - **⚠️ 새만금·시화호 초과분은 오류가 아니다**: 클립 후에도 김제 +110 / 군산 +116 / 부안 +87(합 +313km² = 새만금) / 안산 +39(시화호)로 공표 면적보다 크다. **OSM 해안선이 방조제를 따라 그려져 안쪽 물이 육지 쪽으로 잡히는 것**이고 그 구역은 행정적으로 해당 시군 관할이다. 다른 연안 시군(서산 −3, 화성 −5, 제주시 +0)은 실제값과 일치한다. **버그로 오인해 고치려 하지 말 것.**
    - **S-5b 완료 (2026-08-17)** — 지도에 시군구 레이어 + 줌 전환. `app/(tabs)/index.tsx`.
      - **레이어 구조**: `countries` 소스의 `country-fill`에 `filter: ['!=', ['get','cc'],'KR']`, 한국만 `country-fill-kr`(`filter ['==' …'KR']` + `maxzoom`)로 분리하고, 새 `sgg` 소스의 `sgg-fill`/`sgg-line`에 같은 값의 `minzoom`. **정적 filter + min/maxzoom만으로 정확히 교대**시킨다 — `fill-opacity`에 zoom 표현식을 쓰는 방법보다 단순하고 겹칠 위험이 없다.
      - ⭐ **`SGG_MIN_ZOOM = 6` (에뮬 실측으로 확정)**: **5.0** = 전국+주변국이 보이지만 230개가 다닥다닥해 **판독 불가** / **6.0** = **남한이 화면을 꽉 채우고 제주까지 들어오며 시군구 구분 가능(선택)** / **6.5** = 제주가 잘림 / **7.0** = 남한 절반만 보여 전국 조망 불가. 색칠 지도의 핵심이 "내가 어디를 칠했나"를 한눈에 보는 것이라 **조망을 깨지 않는 가장 늦은 값**이 6이다.
      - **⚠️ Metro는 `.geojson`을 번들하지 못한다** — 앱이 import 하는 렌더링본만 확장자가 `.json`인 이유(`sgg_kr_render.json`). 판정용 원본은 `.geojson` 그대로 둔다.
      - `@/*`가 프로젝트 루트 매핑이라 `data/`에서 바로 import 된다 — `assets/`로 파일을 복사할 필요 없다(중복 방지).
      - **성능 실측**: 팬 8회 + 줌 4회 연속 조작 중 **Choreographer 프레임 드롭 0건**, MapLibre 경고 0건. 에셋 URL 방식·`tolerance` 조정 **불필요**로 판단.
      - ⚠️ **`dumpsys gfxinfo`는 이 앱의 지도 성능 측정에 쓸 수 없다** — MapLibre가 자체 GL 스레드로 그려서 Android UI 프레임 파이프라인에 안 잡힌다(격렬하게 조작해도 "Total frames rendered: 2"). **`Choreographer: Skipped N frames` 로그가 유효한 지표다.**
    - **S-5b+ 줌 버튼 기능 연결 (2026-08-17)**: 우측 `+`/`−`는 **원래 우리 커스텀 UI인데 `onPress`가 아예 없어서** 동작하지 않던 것이었다(MapLibre 기본 컨트롤이 아님 — 우하단 로고·ⓘ만 라이브러리 ornament). `mapRef.getZoom()` + `cameraRef.zoomTo(next, { duration: 300 })`, Camera에 `minZoom`/`maxZoom`.
      - ⭐ **연타는 "무시"가 아니라 "누적"으로 처리한다**: `targetZoomRef`에 진행 중 애니메이션의 **목표**를 담아두고 다음 탭이 그 위에 쌓는다. 이게 없으면 두 번째 탭이 아직 안 끝난 애니메이션의 **중간값**을 읽어 한 단계를 까먹는다. 실측 확인: + 4연타 = 정확히 4단계.
      - 한계에서는 `next === current`로 조기 return — 무반응이고 크래시 없다. 버튼은 `disabled` + opacity 0.3.
    - **S-5c 완료 (2026-08-17)** — 시군구 색칠 바인딩. `sgg_visits`를 `sgg`와 조인해 `osm_relation_id`를 받아 `['match', ['get','osm_id'], …]`로 `fill-color`를 만든다(나라의 `['get','cc']`와 동형).
      - ⭐ **키는 `osm_id`다. `sgg_code`를 쓰면 안 된다** — 2026-07 신설된 인천 4개 구는 코드가 `null`이라 영영 색칠되지 않는다. `osm_id`는 230개 전부 갖고 있다.
      - 쿼리는 **`.select('color, sgg(osm_relation_id)')`** — 대상 테이블 이름이 그대로 `sgg`라 별칭이 불필요하다. **임베드는 객체/배열 양쪽을 흡수**할 것(Phase Q-3의 `normalizeAuthor`와 같은 함정).
      - `useFocusEffect`는 나라+시군구를 함께 부르는 `loadAllVisited`로 묶었고, 실패 시 기존 색칠 에러 배너를 재사용한다(조용한 실패 금지).
      - **검증(에뮬)**: 줌 6 경계 교대가 **제스처·+버튼 양쪽 모두** 정상(KR 한 덩어리 ↔ 230개, 겹침 없음) / `test` 계정은 전부 회색 / `test`에 임시 `sgg_visits` 1행을 넣자 **종로구만 주황**으로 정확히 렌더된 뒤 삭제·기준선 복구.
      - ⚠️ **검증 중 세션이 JWT 만료(`PGRST303`)로 죽었고 `adb shell pm clear` 도 세션을 못 지웠다**(Success를 반환하는데도 남음 — Android 자동 백업 복원으로 추정). 계정을 바꾸려면 **앱 안에서 설정 → 로그아웃**을 쓸 것.
    - **⚠️ 가시성 — 설계 단계부터 반영 필수**: `country_visits` 하드닝(Phase N)에서 잡은 누출("비공개 글만 있는 나라도 방문 사실이 샘")이 그대로 재발할 자리다. 시군구 방문 테이블의 SELECT 정책은 **반드시 `can_view_post` 경유**로 만든다(조건 복붙 금지 — "권한/가시성 모델" 섹션 규칙). INSERT/UPDATE도 `country_visits_insert_requires_post`와 같은 exists 조건이 필요하고, **생성·삭제는 트리거 전담·앱은 색만 UPDATE**라는 G-1/G-2 원칙을 그대로 상속한다. 인덱스는 `posts(sgg_id, user_id)`가 그 서브쿼리에 맞는다(Phase N에서 `posts_country_idx`가 그랬듯).
    - **저장 구조**: 옛 `city_visits`를 되살리지 않고 **새 테이블로 간다**(옛 스키마는 전 세계 `cities` FK 전제라 지금 모델과 안 맞음). **이중 구조** — 한국 게시물은 `country_visits`(KR)도 칠하고 시군구도 칠한다. 세계지도 나라 단위 유지가 확정이라 KR 칠이 사라지면 안 된다.
    - **backfill 부담 없음**: 라이브 기준 전체 게시물 7건 중 한국 4건.
    - **단계 분할**: **S-0 라이선스 확정 ✅ 완료**(2026-08-16 OSM/ODbL로 소스 재확정) → **S-1 city 잔재 정리 ✅ 완료**(커밋 `1f17991`) → **S-2 진행 중**(추출 → **세종 병합(필수)** → 코드 보정 → 개수·속성 검증 → 단순화 실험/용량 측정 → 경계 테이블+적재) → **S-3 ✅ 완료**(경계 테이블+`posts.sgg_id`+판정 트리거+backfill, 마이그레이션 `20260816100000`) → **S-4 ✅ 완료**(`sgg_visits`+RLS+동기화 트리거+backfill, `20260816110000`/`110001`) → S-5(지도 렌더링 — **해안선 클립 → 재단순화 → 용량 재측정**이 여기 포함) → S-6(시군구 상세/색 선택). **출처표시 UI("지도 데이터 출처")는 S-5 또는 S-6 범위에 포함**(아래 라이선스 원칙 참고).
    - **S-1 완료 (2026-07-31, 마이그레이션 `20260731100000_drop_city_remnants.sql`)**: `posts.city_id`(전 행 NULL, 사용 0건)·`posts_city_idx`·`posts_city_id_fkey`·`cities` 테이블(2행 — 서울/도쿄 GeoNames id 시드 잔재, 앱 참조 0곳)·`cities_select_all` 정책 제거. **`city_visits` 테이블은 이미 없었다**(`87f9b33`에서 정상 drop됨) — 남아 있던 건 위 5개뿐.
      - ⚠️ **`posts_with_coords` 뷰가 `city_id`를 물고 있어 뷰를 내렸다 다시 만들어야 했다** — 생성 시 `p.*`가 컬럼 목록으로 확장돼 저장되기 때문. 재생성 시 **`security_invoker = true` 유지가 생명**(빠지면 `posts_select_visible` RLS가 통째로 우회된다). 검증 A7이 이걸 전담으로 본다.
      - **검증**: `scripts/verify-s1-city-cleanup.sql` — 리허설(DDL 인라인+전체 rollback) **18/18 OK**, rollback 후 DB 무오염 실사 확인 → `db push` → 회귀 **A1~A13 13/13 OK**. 앱은 `posts_with_coords`를 명시 컬럼으로만 select(`city_id` 없음)해 영향 표면 0.
      - ⚠️ **이 하네스의 회귀 실행 시 주의**: `[PART A]`뿐 아니라 **B1·B2·B3·B5 행("적용 전" 상태 기록)도 같이 주석 처리**해야 한다. B5가 이미 사라진 `posts.city_id`를 참조해 안 지우면 스크립트 전체가 `42703`으로 죽는다. 헤더에도 적어둠.
- **⭐ 댓글 수정(edit) 미지원 확정 (2026-07-30, Phase Q-1)**: v1은 댓글 **수정을 지원하지 않는다.** 삭제 후 재작성으로 갈음.
  - **UPDATE 정책(`comments_update_self`)을 삭제한 근거**: 그 정책은 `user_id`만 보고 다른 컬럼을 안 잠갔다 → **`created_at` 위조가 통과**했고(검증 8-4에서 `affected=1` 확인), 댓글 목록을 `created_at` 순으로 정렬하므로 **자기 댓글을 맨 위에 고정하는 정렬 조작 벡터**가 됐다. 수정 기능이 없으니 정책 자체를 없애 벡터를 제거하는 쪽이 맞다.
  - 나중에 수정을 넣게 되면 정책을 되살리지 말고, `updated_at` 추가 + `post_id`/`user_id`/`created_at`/`parent_comment_id` 불변을 강제하는 **identity-lock 트리거**(`friendships_lock_identity` 패턴)와 함께 새로 설계할 것. "수정됨" 표시도 같이.
  - ⚠️ **UPDATE 정책이 아예 없으면 에러가 아니라 "조용한 0행"이다** (Phase N에서 확인한 RLS USING 위반과 같은 성질 — 검증 N9로 재확인). 즉 앱에서 실수로 `comments.update()`를 호출하면 **성공한 척 0행**이 된다. 나중에 수정 기능을 붙일 때 "왜 에러가 안 나지?"로 헤매지 말 것 — Phase O의 0행 자기교정 패턴과 같은 이유로, 영향 행 수를 확인하지 않으면 조용히 실패한다.
- **알려진 갭 (백로그, 별도 작업 — Phase O 4단계 조사에서 발견)**:
  - **복합 FK의 참조하는 쪽 `(parent_comment_id, post_id)`에 인덱스가 없다 (Phase Q-1)**: 댓글 1건을 DELETE할 때 자식을 찾느라 스캔이 돈다. 현재 규모(0행)에선 무의미하고 글/계정 삭제 경로는 `post_id` 인덱스를 타므로 영향 없음. **대댓글 UI를 실제로 만들 때 재검토** — 지금 인덱스를 더 얹는 건 과설계로 판단.
  - **프로필 그리드 1페이지 / 나라 필터 칩 / filteredCount가 마운트 1회라 stale**: 글 작성·삭제 후 프로필로 돌아와도 그리드·칩·"내 기록 N"이 갱신되지 않는다(탭이 계속 마운트된 채라 앱 재시작 전엔 안 맞음). 통계 3개는 4단계에서 `useFocusEffect`로 옮겨 해소했지만, 그리드는 페이지네이션 상태(`page`/`hasMore`/`requestIdRef`) 리셋이 얽혀 있어 손이 더 간다. **친구 기능과 무관한 기존 갭** — 별도 작업으로 다룰 것.
- **관찰 노트 (조치 안 함 — Phase Q-0 검증 중 발견)**: 에뮬레이터를 **비행기 모드로 오래(≈10분) 두면** supabase-js의 토큰 갱신이 반복 실패하면서 세션이 로그인 화면으로 떨어진다. 다만 **콜드스타트하면 저장된 세션이 정상 복원**된다(실제로 확인). Q-0의 프로필 확인 경로와 **무관한 supabase-js 세션 갱신 쪽 동작**이고 스스로 복구되므로 손대지 않았다 — 오프라인 테스트 중 로그인 화면이 떠도 당황하지 말 것.
- **무해 판정 경고 (조치 안 함, 이유 기록 — Phase M 조사에서 발견)**:
  - `npm audit` 2건 — ① `postcss <8.5.10`(CSS Stringify XSS) ② `uuid <11.1.1`(v3/v5/v6 buffer bounds). 둘 다 `@expo/metro-config`/`@expo/config-plugins`/`xcode` 등 **Expo CLI 빌드 툴체인의 전이 의존성**이라 로컬 PC에서 `expo start`/`prebuild`할 때만 관여하고 **출시된 앱 런타임(사용자 기기)엔 포함되지 않음**. `npm audit fix --force`가 제시하는 유일한 수정 경로가 `expo@57.0.7` 메이저 업그레이드뿐이라 지금은 조치 불필요 — 위 "출시 후 TODO"의 SDK 업그레이드 때 자연히 같이 해결됨.
  - ⭐ **헷갈리지 말 것**: 위 audit의 `uuid`는 npm 레지스트리의 **`uuid` 패키지**(node_modules 안, xcode가 물고 있는 것)이고, 이번에 `expo-crypto`로 교체한 건 `expo-modules-core`가 export하던 **`uuid` 유틸(패키지 아님, JS API)**이다 — 이름만 같은 완전히 별개의 것. compose.tsx 쪽은 이미 교체 완료, audit의 `uuid` 패키지는 위 항목대로 SDK 업그레이드 때 처리.
- **출시 후 TODO**: Expo SDK 54 → 56 업그레이드(현재는 Expo Go 호환 위해 54 유지 중이었지만, 이제 네이티브 모듈들 때문에 이미 Expo Go 자체가 불가능해졌으므로 그 이유는 사실상 소멸 — 그래도 출시 안정성 위해 업그레이드는 출시 이후로 미룸).
- **⭐ 소셜 로그인 정책 확정 (v1 범위, 못박기 — 2026-07-13)**: v1은 **이메일 + 구글 로그인만**. 카카오·네이버·애플은 v1에 넣지 않는다.
  - 카카오/네이버: Supabase Auth가 기본 제공하는 provider가 아니라 커스텀 OAuth 구현이 필요 — v1 범위 밖.
  - 애플: iOS 정식 출시할 때만 추가한다. 다른 소셜 로그인이 있으면 Apple 로그인 필수라는 스토어 정책 + Apple Developer Program($99/년) 가입이 전제라, 그 전까진 손대지 않는다.
  - **이후 세션에서 "다른 소셜 로그인 추가하자"는 방향으로 새지 말 것** — 이미 검토 후 확정한 결정임.
- **⭐ 출시 시점 방향 결정 (못박기 — 2026-07-19)**: 출시(스토어 등록)는 v1 완료 즉시가 아니라 **v1.x 핵심 기능까지 완성한 뒤로 연기**한다. 로드맵 순서: P2 마무리(공개범위 2개 + 의존성 정리) → 친구 기능 → 좋아요 → 댓글 → 장소검색/3D 지구본 → 출시 준비. 아래 "기능 범위"의 v1/v1.1 구분은 "무엇을 만들 것인가"의 범위 정의로 계속 유효하지만, "언제 만들 것인가"는 이 로드맵을 따른다 — v1.1 항목 중 친구·좋아요·댓글·장소검색·3D 지구본은 더 이상 "출시 후 여유 있을 때"가 아니라 출시 **전** 이 순서대로 만든다(상세는 v1.1 섹션 참고). v1.1의 나머지 항목(사진 위치 필터 토글, 첨부 사진 순서 재정렬, 신고/차단, 푸시 알림, 남의 프로필 보기, 프로필 나라별/날짜별 필터 뷰)은 이 로드맵에 없으므로 여전히 출시 이후.
  - **이후 세션에서 "그냥 지금 있는 걸로 바로 출시하자"는 방향으로 되돌리지 말 것** — 이미 검토 후 확정한 결정임.
- **v1 출시 점검 나머지 후보**:
  - **[P0 필수] — ✅ 전부 완료 (2026-07-14)**
    - ✅ 시드 테스트 데이터 정리 — 완료. DB 실사 결과 스크립트(`scripts/seed-test-data.sql`) 자체는 실행된 적 없음(gp123 계정 posts 5건은 실제 앱으로 만든 수동 테스트 게시물, 남기기로 결정) — 대신 발견된 country_visits 고아 행 DZ(과거 RLS 갭 시기 잔재, 트리거는 정상 확인됨) 1건만 삭제 완료(2026-07-13, SQL 직접 실행·마이그레이션 아님).
    - ✅ 계정 삭제 기능 — 완료 (위 G-3 6단계 참고)
    - ✅ 개인정보처리방침 / 이용약관 — 완료 (위 G-3 7단계 참고, GitHub Pages 호스팅 + 앱 링크 연결)
  - **[P1 빠름] — ✅ 전부 완료 (2026-07-18)**
    - ✅ 앱 아이콘/스플래시 이미지 교체 — 완료 (위 G-3 8단계 참고, 주황 트레일 심볼)
    - ✅ 나라 이름 한글화 — 완료 (위 Phase H 참고)
    - ✅ 정식 설정 화면 신설 — 완료 (위 G-3 9단계 참고)
  - **[P2 조정]**
    - ✅ Pretendard 폰트 적용 — 완료 (위 Phase K 참고)
    - ✅ 에러 바운더리 추가 — 완료 (위 Phase J 참고)
    - ✅ 에러 상태 / 빈 상태(empty state) UI 구분 — 완료 (위 Phase J 참고)
    - ✅ 게시물 공개범위 사후 변경 + 계정 공개범위 토글 — 완료 (위 Phase L 참고, 2026-07-19)
    - ✅ 의존성 경고 정리 — 완료 (위 Phase M 참고, 2026-07-20). **P2 전부 완료.**
  - **[P2 마무리 이후 로드맵 — 출시 전 순차 착수]**: 친구 기능 → 좋아요 → 댓글 → 장소검색/3D 지구본. 배경·순서 근거는 위 "⭐ 출시 시점 방향 결정" 참고 — v1.1 기능이지만 이번엔 출시 후가 아니라 출시 전에 만든다.
  - **[출시]**
    - 구글 플레이 콘솔 개발자 등록($25) + AAB 빌드(EAS, preview는 APK라 별도 프로필 필요) + 스토어 등록 자료(스크린샷, 설명, 개인정보처리방침 URL 연결 등) 준비
    - ⚠️ **로고 텍스트가 아직 `colormap`** (Phase Q 조사 중 발견) — `app/(auth)/login.tsx:60`, `app/(auth)/sign-up.tsx:92`, `app/(onboarding)/username.tsx:116` 3곳. 앱 이름은 Tintrail로 확정됐고 지도 탭 헤더는 이미 "Tintrail"이라 **로그인/회원가입/온보딩만 구 이름이 남아 있다.** 출시 전 교체할 것.

## 기능 범위 (단계별 — 범위 밖은 건드리지 말 것)

### v1 (현재 목표 — "혼자 써도 좋은 기록 앱")

- 회원가입 / 로그인 (이메일 + 소셜 로그인, Apple 포함) + username 2단계 온보딩(유니크·실시간 중복 체크)
- 세계지도(choropleth, 평면↔3D 토글)에서 가본 **나라 색칠** (나라 단위 / ISO 3166-1 / Natural Earth 경계, 나라별 색 선택 — **v1은 고정 팔레트 8색만, 무료**)
- 나라 탭 → 나라 상세(접힌 지도 미리보기 + 인스타식 정사각형 사진 그리드, 나라 전체 게시물) → **위치별 사진+글 기록** (자유 핀 + 자유 지명 `place_label`, 도시 구분 없음 — 한 나라 안에 게시물 여러 개 존재)
- 작성: 위치는 **지도 핀 + 장소 검색(지오코딩) 둘 다** 필수 — 나라(country_code)는 핀 좌표 역지오코딩으로 자동 파생(C-2-2b), 사용자 입력 불필요. **도시 선택 없음**(구조적 `cities` 엔티티로 만들지 않기로 확정 — C-2-3a, `posts.city_id`는 nullable로 남지만 v1에서 미사용), 대신 자유 지명(`place_label`) 입력 · 사진 **다중 첨부 + 대표 지정**(post_media 1:N, 대표=order_index 0)
- 게시물 가시성 토글 (public / friends / private, 기본 '전체공개')
- 계정 가시성 토글 (public / private — 프로필 설정 안)
- 내 프로필 = 통계(방문 나라/게시물 수 — 도시 구분 없음 확정으로 "방문 도시 수"는 제외) + 내 사진 그리드 (**미니 지도 없음** — 지도 탭과 중복)

### v1.1 (범위 정의는 유효, 착수 시점은 "⭐ 출시 시점 방향 결정" 로드맵 참고 — 전부 "아직 만들지 말 것"은 아님)

- ⚠️ **출시 전 순차 착수 (로드맵에 포함)**: 친구(상호 수락) → 좋아요 → 댓글 → **한국 시군구 색칠(Phase S)** → 장소검색(지오코딩). 순서·배경은 "현재 단계"의 "⭐ 출시 시점 방향 결정" 참고.
  - ⛔ **3D 지구본 토글 — 백로그(출시 후 재검토, 2026-07-31 확정)**. 2D 평면지도로 충분. 위 로드맵에서 빠졌다.
  - ✅ 친구(상호 수락) — **완료(Phase O, 2026-07-22)**. compose·게시물 편집의 '친구공개' 옵션도 활성화됨(과거 `VISIBILITY_OPTIONS`의 `hidden: true`는 Phase O 5단계에서 제거).
  - ✅ 좋아요 — **완료(Phase P, 2026-07-27)**. 게시물 상세 하트+개수, count-on-read. 상세는 "현재 단계"의 Phase P 참고.
  - ✅ 댓글 — **완료(Phase Q, 2026-07-31)**. 게시물 상세 목록/작성/삭제, 오래된 순 전체 로드(limit 100). **수정(edit)은 미지원 확정.** 상세는 "현재 단계"의 Phase Q 참고.
- **여전히 출시 이후 (착수 보류)**: 같은 나라 내 시간순 루트 선 · 사진 위치 필터 토글(EXIF 기반 핀 근방 사진 추천) · 첨부 사진 순서 재정렬(order_index) · 신고/차단 · 푸시 알림 · **남의 프로필 보기(그 사람 색칠 세계지도 포함)** · **프로필 게시물 나라별/날짜별 필터 뷰**(`country_code`·`created_at` 이미 있어 데이터는 준비됨 — 필터 UI만 별도 단계로 예정, 도시별 그룹핑은 없음)

### v1.2 (아직 만들지 말 것)

탐색(돋보기) 탭 · 색깔 구매(소액 결제 — 컬러휠·그라데이션·hex 직접입력 잠금해제. v1 고정 팔레트 8색은 계속 무료) · 프리미엄 구독

## 디자인 / UI 구조 (디자인 단계 확정 — 상세는 docs/PRD.md 6~8장)

- **디자인 토큰**: 흰 배경 · 액센트 주황 `#ff6a2b`(앱 테마색) · 둥근 모서리 · Pretendard · 390×844 기준.
  - ⚠️ 테마 주황 ≠ 나라 색칠 색. 나라 색은 사용자가 나라별로 고르는 별개 값(`country_visits.color`).
- **네비게이션**: 하단 탭 3개 = 지도 / +(작성) / 프로필. 탐색(돋보기) 탭 자리는 v1.1용으로 비워둠. **첫 화면 = 지도 탭**.
- **공통 컴포넌트**: 인스타식 정사각형 사진 그리드 — 나라 상세·프로필이 재사용.
- **나라 상세**: 상단 접힌 지도 미리보기 + 사진 그리드(나라 전체 게시물 — 도시 구분 없음 확정, C-2-3a로 도시 드롭다운 필터는 만들지 않음), 나라 색 선택은 더보기(…) 안.
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
- ✅ ~~⛔ 친구 기능 선행 조건~~ **해소 완료 (2026-07-20, Phase N)** — `country_visits_select_visible`을 "뷰어가 볼 수 있는 게시물이 그 나라에 하나라도 있어야" 노출하도록 재작성함(마이그레이션 `20260720100000_friend_kickoff_rls_hardening.sql`). 해소 근거: 리허설(rollback) + 라이브 적용 후 재검증 둘 다 시나리오 1(비공개 글만 있는 나라 → 타인에게 country_visits 0행, 수정 전이었다면 1이 나왔을 자리) 포함 18개 시나리오 전부 통과.
- ⭐ **가시성 판정 단일 소스 (2026-07-20 확정)**: 게시물 가시성 판정은 반드시 `can_view_post(p posts, viewer uuid)` 함수를 경유할 것 — **조건을 다른 정책에 복붙 금지**. 지금 `posts_select_visible`과 `country_visits_select_visible`이 이 함수 하나를 공유한다. **좋아요·댓글 RLS를 만들 때도 이 함수를 재사용할 것** — 지금 있는 `post_likes_select_if_post_visible`/`comments_select_if_post_visible`는 `exists (select 1 from posts where posts.id = ...)`로 posts 테이블 자체의 RLS(=can_view_post)에 암묵적으로 얹혀가는 방식이라 이미 안전하고, **둘 다 롤백 트랜잭션으로 실증 완료**(post_likes = Phase P 6시나리오 `scripts/verify-likes-rls.sql` / comments = Phase Q-1 `scripts/verify-comments-rls.sql`). 가시성 조건을 직접 다시 쓰는 새 정책이 필요해지면 반드시 `can_view_post` 호출로 만들 것.
- **friendships 상태 전이 규칙 (2026-07-20 확정, RLS + 트리거로 강제)**: INSERT는 `status='pending'`일 때만 허용(직접 `accepted`로 생성 불가) / pending→accepted 전환(UPDATE)은 **요청받은 쪽(비요청자)만** 가능, 요청자 본인은 셀프 수락 불가 / **accepted가 된 뒤엔 그 행을 UPDATE로 더 바꿀 수 없음** — 끊기·거절은 항상 DELETE(둘 다 동일 처리). `friendships_lock_identity` 트리거가 UPDATE 시 `user_low`/`user_high`/`requested_by`/`created_at` 변조를 막는다(RLS의 USING/WITH CHECK만으론 "이전 행과 동일해야 함"을 표현할 수 없어 트리거로 보강한 것).
- **RLS 검증 하네스**: `scripts/verify-friends-rls.sql` — 롤백 트랜잭션 안에서 `set local role authenticated` + `request.jwt.claims`로 특정 유저를 흉내내 정책을 실제로 검증하는 패턴(각 시나리오 결과를 temp table에 모아뒀다가 마지막에 한 번에 조회 — `supabase db query`가 멀티스테이트먼트 스크립트에서 마지막 statement 결과만 돌려주는 걸 발견해서 우회한 방식). 이후 posts/country_visits/friendships RLS를 다시 건드릴 때 이 파일을 복제해서 시나리오만 바꿔 재사용할 것. 복제본: `scripts/verify-likes-rls.sql`(Phase P), `scripts/verify-comments-rls.sql`(Phase Q-1).
  - ⭐ **verify-comments-rls.sql은 "리허설 겸 회귀" 2용도**: `[PART A]`에 마이그레이션 DDL을 인라인으로 넣어두고 통째로 rollback하므로, **db push 전에 라이브 DB에서 결과를 미리 볼 수 있다**(실데이터 무오염). push 이후엔 `[PART A]` 블록만 주석 처리하면 그대로 회귀 테스트가 된다. 앞으로 마이그레이션이 있는 작업은 이 형태를 기본으로 쓸 것.
  - ⚠️ 스크립트를 가공할 때 **PowerShell `Get-Content`/`Set-Content` 왕복 금지** — 기본 인코딩이 ANSI라 한글이 깨지면서 줄이 붙어 문법 오류가 난다(실제로 겪음). 행 단위 가공은 `sed`(바이트 안전)로 할 것.
- ⭐ **검증 기준선 (2026-08-16 확정 — 여기가 유일한 기준, 다른 곳에 따로 적지 말 것)**:
  > **comments 0 / post_likes 0 / 3계정 전부 public / friendships는 `test↔gp123` accepted 1행만**
  - 나머지(참고): `posts` 7행(한국 4건), `country_visits` 4행, `profiles` 3행 — 실제 수동 테스트 데이터라 정리 대상이 **아니다**.
  - `test↔gp123` accepted 1행은 **의도적으로 남긴다** — 2계정 가시성 검증(친구공개 글, 시군구 방문 가시성 등)에 친구 쌍이 매번 필요하다. 지우지 말 것.
  - **⚠️ 계정 공개범위(`profiles.visibility`)는 현재 DB 상태에 의존하지 말고 검증 시나리오 초입에서 SQL로 명시적으로 세팅할 것** — Phase P에서 확정한 규칙, 기준선이 public이어도 직전 시나리오가 바꿔놨을 수 있다.
- ⭐ **검증 후 정리 체크리스트 (에뮬 2계정 시나리오를 돌렸으면 매번 이 순서로 복구)**:
  1. `comments` — 작성한 댓글 전부 삭제 (0행)
  2. **`post_likes` — 누른 하트 전부 삭제 (0행)** ← 2026-08-16 추가
  3. `profiles.visibility` — 3계정 전부 `public`으로 되돌리기
  4. `friendships` — 검증 중 만든 pending/accepted 행 삭제, **`test↔gp123` accepted 1행만 남기기**
  5. 테스트로 만든 `posts`가 있으면 삭제 (G-1 트리거가 `country_visits`를 알아서 정리한다 — 직접 지우지 말 것)
  - ⚠️ **`post_likes`가 이 목록에 없었던 게 실제 누락 원인이다** (2026-08-16 발견): Phase P 검증 때 `gp123`이 자기 글에 누른 하트 2행이 3주 가까이 남아 있었다. Phase Q-3의 복구 문구에 좋아요 항목이 아예 없었던 탓 — **앞으로 새 기능을 만들면 그 기능이 만드는 행도 이 체크리스트에 추가할 것.**
  - 같은 시기 `friendships`에도 `gp123 → mini` pending 잔재 1행(2026-07-20 Phase N/O 시절)이 남아 `mini` 프로필에 받은요청 뱃지가 계속 떠 있었다. 둘 다 2026-08-16에 정리 완료.
  - 기준선 확인 1줄 쿼리:
    ```
    npx supabase db query --linked "select (select count(*) from comments) c, (select count(*) from post_likes) l, (select count(*) from profiles where visibility='public') pub, (select count(*) from friendships) fr, (select count(*) from friendships where status='accepted') fr_ok;"
    ```
    기대값: `c=0, l=0, pub=3, fr=1, fr_ok=1`
  - ⚠️ `supabase db query --linked`는 **한동안 안 쓰다 처음 치면 콜드스타트로 타임아웃**(`LegacyDbConfigLoginRoleStatusError`, "Failed to create login role: Connection terminated due to connection timeout")이 난다. 프로젝트가 죽은 게 아니라 그냥 깨어나는 중이니 **한두 번 더 치면 붙는다**(2026-08-16 실제로 3번째에 정상). 참고로 `db.<ref>.supabase.co`는 IPv6 전용이라 직접 psql 접속은 이 환경에서 안 된다 — CLI의 `--linked`(Management API 경유)를 쓸 것.

## 장소 기록 방식

- **게시물 모델 확정** (2026-07-02, C-2-3a): **도시 구분 없음.** 나라(`country_code`, 필수) 안에 자유 핀(`location`, 필수) + 사용자가 직접 쓰는 지명(`place_label`, 옵셔널)이 합쳐져 게시물 하나가 된다. 한 나라 안에 게시물이 여러 개 있을 수 있다 — 나라상세 화면은 도시별로 나누지 않고 그 나라의 전체 게시물을 보여준다.
- **나라**: 필수. v1은 자유 핀 좌표를 역지오코딩해 `posts.country_code`를 자동 파생(C-2-2b) — 사용자가 나라를 직접 고르지 않음.
- **도시(`cities` 테이블)**: 구조적 엔티티로 쓰지 않기로 확정. `cities` 테이블과 `posts.city_id` 컬럼은 스키마상 남아있지만(v1.1에서 데이터가 채워지면 재검토 여지만 남겨둠) v1 흐름에서는 사용하지 않는다 — 자유 지명은 `place_label`로 기록.
- **도시 안 위치**: 자유 핀(위경도), 필수. 게시물이 이 핀에 붙는다.
- **프로필 필터(방향만 확정, 아직 안 만듦)**: 프로필에서 모든 나라의 내 게시물을 보고 나라/날짜 등으로 필터링하는 기능은 별도 단계로 예정. `country_code`·`created_at` 컬럼이 이미 있어 데이터는 준비돼 있지만, 필터 UI 자체는 지금 범위 밖.
- **루트**: 같은 나라 내 게시물을 `taken_at` 기준 정렬해 선으로 잇는다 (별도 테이블 없이 계산으로 도출, v1.1) — 도시 구분이 없으므로 나라 단위로 잇는다.

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
  - **색칠 생성/삭제는 DB 트리거 전담, 앱은 색 변경만** (Phase G-1/G-2 확정). `posts` INSERT/DELETE 시 `country_visits` 행이 자동 생성·삭제된다 — 앱 코드는 절대 `country_visits`에 INSERT/upsert하지 않고 기존 행의 `color`만 UPDATE한다. 게시물 없는 나라는 색칠 UI 자체가 잠긴다.

## 데이터 모델 (요약 — 상세 SQL은 docs/PRD.md 참고)

profiles, friendships, cities, country_visits, posts, post_media, post_likes, comments

- PostGIS `geography(point, 4326)` 사용 (cities.centroid, posts.location)
- 전체 스키마 + RLS 정책은 **docs/PRD.md 9장**에 있음. 마이그레이션은 거기서 가져올 것.
- 게시물 사진은 Supabase Storage private 버킷 `post-media` (경로 `posts/{user_id}/{post_id}/{파일명}`). 보안 설계·RLS 정책은 **docs/PRD.md 9.5** 참고.

## 외부 데이터 라이선스 원칙 (2026-07-31 확정 — 새 데이터 소스 도입 시 반드시 이 기준으로 판정)

- **⭐ 우리가 데이터로 하는 일은 전부 "변형(2차적 저작물 작성)"이다.** 단순화(simplify)·좌표계 변환·DB 적재·GeoJSON 변환 — 원본을 그대로 두지 않는다. 그래서 **"상업적 이용 가능"만 보고 고르면 안 되고 "변경 가능"을 같이 봐야 한다.**
- **공공누리 유형별 판정** (출처: [공공누리](https://www.kogl.or.kr/info/license.do), [공공데이터포털 정책](https://www.data.go.kr/ugs/selectPortalPolicyView.do)):
  - ✅ **제1유형(출처표시)** — "상업적, 비상업적 이용가능" + **"변형 등 2차적 저작물 작성 가능"**. 우리가 쓸 수 있는 기본형. 출처표시만 지키면 단순화·변환·적재 전부 허용된다.
  - ✅ **제0유형(자유이용)** — 제한 없음. 당연히 가능.
  - ❌ **제2유형(비상업)** / ❌ **제4유형(비상업+변경금지)** — 상업 이용 불가. 이 앱은 스토어 출시 앱이라 탈락.
  - ⛔ **제3유형(출처표시+변경금지)은 "상업적 이용가능"이라고 적혀 있어도 우리는 못 쓴다** — **변경금지**라 단순화·좌표변환·DB적재 자체가 막힌다. **여기서 헷갈리지 말 것: 상업 가능 여부와 무관하게 변경금지면 탈락이다.**
  - 데이터셋 표기가 `이용허락범위 제한 없음`이면 유형 표기 없이 제약 없음 — 사용 가능.
- **⚠️⚠️ 포털 메타데이터의 라이선스와 실제 배포처 약관이 다를 수 있다 — Phase S에서 두 번 적중했다.** ① 같은 계열이어도 공공데이터포털은 "제한 없음"인데 국가공간정보포털 오픈마켓은 CC BY-NC-ND. ② **`15125064`는 포털 메타가 "제한 없음"이었는데 실제 배포처 약관이 CC BY-NC-ND라 탈락**했다(변경금지가 결정타). **다운로드가 외부 사이트로 넘어가면 반드시 그쪽 약관까지 따라가서 확인할 것 — 포털 표기만 믿고 확정하지 말 것.**
- **⭐ ODbL(OpenStreetMap 계열)은 공공누리와 판정 축이 다르다 (2026-08-16 추가)**: 상업·변형은 자유지만 **share-alike가 있다.** ⛔ **"가공 데이터를 배포 안 하면 share-alike를 피할 수 있다"는 틀렸다** — ODbL **4.4(c)** 가 "파생 DB로 만든 Produced Work를 공개 사용하면 그 파생 DB도 공개 사용된 것"으로 규정해 우회로를 막는다. 상세 의무와 충족 방법은 "현재 단계"의 **Phase S — ODbL 의무 3개** 항목 참고(거기가 정본).
- **⭐ 증거 보관 의무 (Phase S에서 확정)**: 다운로드 시 화면에 표시되는 **라이선스 마크/문구를 캡처해 `docs/licenses/`에 보관한다.** 포털 메타데이터는 나중에 바뀌거나 데이터셋이 폐기될 수 있으므로(실제로 시군구 경계 데이터셋 2개가 `폐기되었습니다`로 사라짐), **받은 시점의 화면이 실질 증거다.**
- **⭐ 출처표시는 소스와 무관하게 항상 넣는다 (확정)**: 라이선스가 출처표시를 요구하지 않더라도 넣는다. 소스를 바꿔도 UI를 다시 만들 필요가 없고, 표기 누락 리스크가 원천적으로 사라진다. **설정 화면에 "지도 데이터 출처" 항목**을 둔다(Phase S-5 또는 S-6 범위).
- 참고: 현재 쓰는 `assets/geo/countries.json`은 **Natural Earth(퍼블릭 도메인)** — 이 원칙과 무관하게 제약 없음.

## 트러블슈팅 (환경 이슈 — 재발 시 시간 아끼려고 기록)

- **에뮬레이터 네트워크 먹통 (앱이 `Network request failed` 반복, 2026-07-31)**: 스냅샷에서 복원된 에뮬레이터가 WiFi는 붙었는데(`wlan0` UP + IP 할당) 실제 외부 통신이 전부 실패하는 상태가 됐다. **우회책: 콜드 부팅** — `emulator.exe -avd <AVD> -no-snapshot-load -no-snapshot-save -dns-server 8.8.8.8`. 재부팅 후 정상화 확인됨.
  - ⚠️⚠️ **`-dns-server`에 값을 2개 주면 DNS가 통째로 죽는다 (2026-08-17 확인)**: `-dns-server 8.8.8.8,8.8.4.4`로 콜드 부팅하면 부팅은 되고 `dumpsys connectivity`도 **`VALIDATED`로 나오는데** 앱은 계속 `Network request failed`이고, 에뮬 안에서 `curl`을 때리면 **`Could not resolve host`** 가 나온다(연결 문제가 아니라 이름 해석 문제다). **값을 하나(`-dns-server 8.8.8.8`)로 줄이면 즉시 해결된다** — 같은 세션에서 2개 → 실패, 1개 → `HTTP 200` 재현 확인. **과거 이 문서에 적혀 있던 2개짜리 명령이 원인이었다.**
  - ⚠️ **`adb root`로 DNS를 고치려 하지 말 것** — Play 이미지(production build)는 `adbd cannot run as root`라 `setprop net.dns1`이 막힌다. 부팅 옵션으로만 해결된다.
  - ⚠️ **`VALIDATED`를 근거로 "네트워크 정상"이라 판단하지 말 것.** DNS만 죽어도 VALIDATED가 뜬다. 확실한 판정은 **에뮬 안에서 `adb shell curl -v https://www.google.com`** 을 때려 `Could not resolve host`인지 확인하는 것이다(단 `curl`이 000을 주는 건 권한 문제일 수도 있으니 **에러 문구까지** 볼 것).
  - ⚠️ **근본 원인은 미확정** (스냅샷 복원 상태 문제로 추정만 함). 재발하면 원인 파고들기 전에 일단 콜드 부팅으로 넘길 것.
  - ⚠️ **진단할 때 헷갈리기 쉬운 함정 2개** (실제로 여기서 오진했음):
    - `ip route`(메인 테이블)에 디폴트 라우트가 없는 건 **정상**이다. Android는 네트워크별 정책 라우팅을 써서 default가 `table 1016` 같은 별도 테이블에 들어간다 — `ip route show table all | grep default`로 봐야 한다.
    - `adb shell ping`은 fwmark/권한 때문에 네트워크가 멀쩡해도 `Network is unreachable`이 뜬다. **네트워크 판정 근거로 쓰지 말 것.**
    - 제대로 된 판정은 `adb shell "dumpsys connectivity --short"`에서 `VALIDATED`/`INTERNET` 확인.
  - ⚠️ **Metro 번들 성공은 에뮬 네트워크가 살아있다는 증거가 아니다** — `adb reverse`는 IP 라우팅이 아니라 adb 채널을 타기 때문에, 외부 통신이 다 죽어도 번들링은 멀쩡히 된다.
- **앱이 조회 실패인지 빈 상태인지 구분하는 법**: Phase J 규칙상 fetch 실패는 `ErrorView`, 데이터 없음은 빈 상태 문구다. 프로필에 "아직 기록이 없어요"가 뜨면 네트워크 문제가 아니라 진짜 0건이다.

## 코딩 규칙 / 선호

- 언어: TypeScript (strict 지향)
- 한 번에 거대한 변경 말고, 작은 단위로 나눠서 작업하고 설명할 것
- 권한·보안 관련 코드는 특히 신중하게, RLS와 일관되게
- ⚠️ **트리거를 새로 만들면 그 이전에 생성된 데이터는 반응하지 않는다. 트리거 마이그레이션에는 항상 멱등 backfill을 짝으로 붙일 것.** 검증 스크립트는 자기가 만든 데이터로만 트리거를 확인하므로 이 공백을 구조적으로 못 잡는다 — **실제 테이블 행수를 별도로 확인할 것.** (S-4에서 `sgg_visits` 0행으로 실제 발생)
- 비밀키 주의: `anon` 키만 앱에. `service_role` 키는 절대 앱 코드/레포에 넣지 말 것
- `.env`는 `.gitignore`에 포함 (커밋 금지)
- 커밋 메시지는 간결한 conventional 스타일 (feat:, fix:, chore: 등)

## 참고 문서

- `docs/PRD.md` — 제품 정의서 + 전체 DB 스키마 + RLS 정책 + PostGIS 쿼리 예시
