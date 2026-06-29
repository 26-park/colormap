# CLAUDE.md — colormap 프로젝트 가이드

> 이 파일은 Claude Code가 매 세션 시작 시 읽는 프로젝트 안내문이다.
> 프로젝트가 진행되며 계속 업데이트한다 (특히 "현재 단계" 섹션).

## 프로젝트 한 줄 정의

여행 기록을 세계지도 위에 쌓고, 도시 단위로 남의 여행을 발견하는 **위치 기반 여행 SNS**.
지도 색칠은 진입점일 뿐이고, 핵심 가치는 도시 안에서 흐르는 콘텐츠와 발견(탐색)에 있다.

## 기술 스택 (확정)

- **앱**: Expo (React Native) + TypeScript / 현재 **Expo SDK 54** (Expo Go 호환 위해 54로 시작, 추후 56으로 업그레이드 예정)
- **네비게이션**: Expo Router (파일 기반)
- **백엔드/DB**: Supabase (Postgres + PostGIS)
- **지도**: Mapbox (시작은 MapLibre 가능) — 네이티브 모듈이라 Expo Go 불가, 개발 빌드 필요
- **이미지**: Supabase Storage (추후 CDN 전환 여지)
- **빌드/배포**: Expo EAS (Build / Submit / Update)
- **결제(추후)**: RevenueCat + 스토어 인앱결제
- **분석/모니터링(추후)**: PostHog + Sentry
- 개발 환경: **Windows**, 맥 없음 → iOS 빌드는 EAS 클라우드 빌드 사용

## 현재 단계 ⭐ (자주 바뀌는 부분)

- **지금: v1 개발 중.** 아래 v1 범위 안에서만 구현할 것. v1.1, v1.2 기능은 아직 만들지 말 것.
- 환경 셋업 완료: Expo 프로젝트 생성됨, 폰 Expo Go에서 실행 확인됨.
- 다음 작업 예정: GitHub 연결 → Supabase 셋업 + 스키마 마이그레이션 → 인증 화면 → 지도 화면.

## 기능 범위 (단계별 — 범위 밖은 건드리지 말 것)

### v1 (현재 목표 — "혼자 써도 좋은 기록 앱")

- 회원가입 / 로그인 (이메일 + 소셜 로그인, Apple 포함)
- 세계지도에서 가본 **도시 색칠** (기본 색상만)
- 도시 누르면 → 그 안에 **위치별 사진+글 기록** (자유 핀, 위경도)
- 게시물 가시성 토글 (public / friends / private)
- 계정 가시성 토글 (public / private)
- 내 프로필 = 내 지도 + 기본 통계(방문 도시 수, 나라 수)

### v1.1 (아직 만들지 말 것)

좋아요 · 댓글 · 친구(상호 수락) · 같은 도시 내 시간순 루트 선 · 신고/차단 · 푸시 알림

### v1.2 (아직 만들지 말 것)

탐색(돋보기) 탭 · 색깔 구매(소액 결제) · 프리미엄 구독

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

## 데이터 모델 (요약 — 상세 SQL은 docs/PRD.md 참고)

profiles, friendships, cities, city_visits, posts, post_media, post_likes, comments

- PostGIS `geography(point, 4326)` 사용 (cities.centroid, posts.location)
- 전체 스키마 + RLS 정책은 **docs/PRD.md 6장**에 있음. 마이그레이션은 거기서 가져올 것.

## 코딩 규칙 / 선호

- 언어: TypeScript (strict 지향)
- 한 번에 거대한 변경 말고, 작은 단위로 나눠서 작업하고 설명할 것
- 권한·보안 관련 코드는 특히 신중하게, RLS와 일관되게
- 비밀키 주의: `anon` 키만 앱에. `service_role` 키는 절대 앱 코드/레포에 넣지 말 것
- `.env`는 `.gitignore`에 포함 (커밋 금지)
- 커밋 메시지는 간결한 conventional 스타일 (feat:, fix:, chore: 등)

## 참고 문서

- `docs/PRD.md` — 제품 정의서 + 전체 DB 스키마 + RLS 정책 + PostGIS 쿼리 예시
