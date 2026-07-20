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
- **⭐ 다음 세션 시작점**: 아래 로드맵 순서대로 (배경은 바로 아래 "⭐ 출시 시점 방향 결정" 참고).
  1. 친구 기능 UI (찾기 → 요청 → 수락 → 목록) — RLS/DB 기반은 Phase N에서 이미 완료(⛔ 차단 조건 해소, friendships INSERT/UPDATE 보강). ⚠️ username 검색 인프라가 없음(`pg_trgm` 확장도, 검색 RPC도 없음 — `profiles.username`엔 정확 일치/prefix용 암묵적 unique btree뿐) — "친구 찾기" 화면을 만들려면 이것부터 설계해야 함.
  2. 좋아요
  3. 댓글
  4. 장소검색(지오코딩) / 3D 지구본 토글
  5. **출시 준비**: 구글 플레이 콘솔 개발자 등록($25) + AAB 빌드(EAS, `preview` 프로필은 APK라 별도 프로필 필요) + 스토어 등록 자료(스크린샷, 설명, 개인정보처리방침 URL) 준비
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

- ⚠️ **출시 전 순차 착수 (로드맵에 포함)**: 친구(상호 수락) → 좋아요 → 댓글 → 장소검색(지오코딩)/3D 지구본 토글. 순서·배경은 "현재 단계"의 "⭐ 출시 시점 방향 결정" 참고.
  - 친구 기능이 붙기 전까지 compose·게시물 편집의 '친구공개' 옵션은 `lib/posts.ts`의 `VISIBILITY_OPTIONS`에서 `hidden: true`로 숨겨져 있다(친구가 없어 사실상 "나만 보임"과 같은 효과라서) — 친구 기능 착수 시 이 `hidden`만 지우면 두 화면 다 자동으로 열림.
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
- ⭐ **가시성 판정 단일 소스 (2026-07-20 확정)**: 게시물 가시성 판정은 반드시 `can_view_post(p posts, viewer uuid)` 함수를 경유할 것 — **조건을 다른 정책에 복붙 금지**. 지금 `posts_select_visible`과 `country_visits_select_visible`이 이 함수 하나를 공유한다. **좋아요·댓글 RLS를 만들 때도 이 함수를 재사용할 것** — 지금 있는 `post_likes_select_if_post_visible`/`comments_select_if_post_visible`는 `exists (select 1 from posts where posts.id = ...)`로 posts 테이블 자체의 RLS(=can_view_post)에 암묵적으로 얹혀가는 방식이라 이미 안전하지만, 가시성 조건을 직접 다시 쓰는 새 정책이 필요해지면 반드시 `can_view_post` 호출로 만들 것.
- **friendships 상태 전이 규칙 (2026-07-20 확정, RLS + 트리거로 강제)**: INSERT는 `status='pending'`일 때만 허용(직접 `accepted`로 생성 불가) / pending→accepted 전환(UPDATE)은 **요청받은 쪽(비요청자)만** 가능, 요청자 본인은 셀프 수락 불가 / **accepted가 된 뒤엔 그 행을 UPDATE로 더 바꿀 수 없음** — 끊기·거절은 항상 DELETE(둘 다 동일 처리). `friendships_lock_identity` 트리거가 UPDATE 시 `user_low`/`user_high`/`requested_by`/`created_at` 변조를 막는다(RLS의 USING/WITH CHECK만으론 "이전 행과 동일해야 함"을 표현할 수 없어 트리거로 보강한 것).
- **RLS 검증 하네스**: `scripts/verify-friends-rls.sql` — 롤백 트랜잭션 안에서 `set local role authenticated` + `request.jwt.claims`로 특정 유저를 흉내내 정책을 실제로 검증하는 패턴(각 시나리오 결과를 temp table에 모아뒀다가 마지막에 한 번에 조회 — `supabase db query`가 멀티스테이트먼트 스크립트에서 마지막 statement 결과만 돌려주는 걸 발견해서 우회한 방식). 이후 posts/country_visits/friendships RLS를 다시 건드릴 때(좋아요·댓글 등) 이 파일을 복제해서 시나리오만 바꿔 재사용할 것.

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

## 코딩 규칙 / 선호

- 언어: TypeScript (strict 지향)
- 한 번에 거대한 변경 말고, 작은 단위로 나눠서 작업하고 설명할 것
- 권한·보안 관련 코드는 특히 신중하게, RLS와 일관되게
- 비밀키 주의: `anon` 키만 앱에. `service_role` 키는 절대 앱 코드/레포에 넣지 말 것
- `.env`는 `.gitignore`에 포함 (커밋 금지)
- 커밋 메시지는 간결한 conventional 스타일 (feat:, fix:, chore: 등)

## 참고 문서

- `docs/PRD.md` — 제품 정의서 + 전체 DB 스키마 + RLS 정책 + PostGIS 쿼리 예시
