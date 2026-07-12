# 여행기록 SNS — 제품 정의서(PRD) & 데이터베이스 설계

> 버전 0.2 · 작성 기준: v1 MVP 출시를 향한 설계 문서 (디자인 단계 반영)
> 스택: Expo(React Native) + TypeScript / Supabase(Postgres + PostGIS) / Mapbox / Expo EAS

---

## 1. 제품 한 줄 정의

지도 색칠 트래커가 아니라, **여행 기록을 지도 위에 쌓고 도시 단위로 남의 여행을 발견하는 위치 기반 SNS**.
색칠은 진입점(미끼)이고, 진짜 가치는 도시 안에서 흐르는 콘텐츠와 발견(돋보기)에 있다.

### 핵심 차별점 (경쟁 앱이 안 하는 것)
1. 도시 내부로 들어가는 위치 기반 SNS 피드 (위치별 사진·글·댓글·좋아요)
2. 같은 도시 안 기록을 시간순 선으로 잇는 여행 루트 시각화
3. 도시 단위로 남의 여행을 발견하는 탐색(돋보기)

---

## 2. 권한 / 가시성 모델 (이 앱의 심장)

### 2.1 계정 단위
- `profile_visibility`: **public** | **private**
- 계정 검색: public/private 상관없이 **계정 자체는 검색에 노출**된다.
- private 계정의 **내역(게시물)** 은 친구만 볼 수 있다.

### 2.2 게시물 단위
- `post_visibility`: **public** | **friends** | **private**
- `private` 게시물은 계정 설정과 무관하게 **작성자 본인만** 본다.

### 2.3 친구 관계
- 상호 수락(양방향). 한쪽이 요청하고 상대가 수락해야 친구.

### 2.4 가시성 판정 로직 (구현의 기준)
뷰어 `V`가 작성자 `A`의 게시물 `P`를 볼 수 있는가:

```
1. V == A                      → 보임 (본인 글)
2. P.visibility == 'private'   → 차단 (작성자만)
3. P.visibility == 'friends'   → V와 A가 친구일 때만 보임
4. P.visibility == 'public'
     - A.profile_visibility == 'public'  → 모두 보임
     - A.profile_visibility == 'private' → V와 A가 친구일 때만 보임
```

### 2.5 돋보기(탐색) 피드 정의
다음의 합집합:
- (작성자가 public) AND (게시물이 public) 인 게시물
- (작성자가 내 친구) AND (게시물이 public 또는 friends) 인 게시물  ← 친구가 private이어도 나에겐 노출

---

## 3. 기능 범위 (단계별 — 잔인하게 잘랐다)

### v1 — "혼자 써도 좋은 기록 앱" (출시 목표)
유저가 없어도 가치 있어야 사람이 모인다. 소셜·탐색은 아직 끈다.
- 회원가입 / 로그인 (이메일 + 소셜 로그인)
- 세계지도에서 가본 **나라 색칠** (나라 단위, ISO 3166-1 / Natural Earth 경계)
- 나라 탭 → 나라 상세에서 그 나라의 **위치별 사진+글 기록** 보기 (자유 핀)
- 게시물에 **사진 여러 장 첨부** (앨범에서 다중 선택)
- 게시물 가시성 토글 (public / friends / private)
- 계정 가시성 토글 (public / private)
- 내 프로필 = 내 지도 + 기본 통계(방문 나라 수, 게시물 수 — 도시 구분 없음 확정으로 "방문 도시 수"는 제외, 5장 참고)

### v1.1 — "소셜 켜기"
- 좋아요 · 댓글
- 친구(상호 수락) 요청·수락·목록
- 같은 나라 내 게시물을 **시간순 루트 선**으로 연결 (도시 구분 없음 확정 — 나라 단위로 잇는다)
- **앨범 사진 위치 필터 토글**: "전체 사진 보기" ↔ "현재 핀 근방 사진 보기" 전환.
  근방 보기는 사진 EXIF 위치를 읽어 선택한 핀 반경 내 사진만 추려 보여준다 (= 위치 기반 사진 추천).
- **첨부 사진 순서 드래그 재정렬** (`post_media.order_index` 활용)
- **남의 프로필 보기** — 친구/탐색과 함께 켜진다. 남의 프로필에서는 그 사람의 **색칠된 세계지도**도 표시한다(내 프로필엔 미니 지도 없음).
- **프로필 게시물 나라별/날짜별 필터 뷰** — 모든 나라의 내 게시물을 나라·날짜 등으로 필터링(도시별 그룹핑은 없음, 5장 참고). `country_code`·`created_at`이 이미 있어 데이터는 준비됨 — 필터 UI만 이 단계에서 추가.

### v1.2 — "발견 + 수익화"
- 탐색(돋보기) 탭 — 도시 단위 발견
- 색깔 구매(소액 결제): 컬러휠·그라데이션·hex 직접입력 잠금해제. (v1의 고정 팔레트 8색은 계속 무료.)
- 프리미엄 구독(무제한 기록·고급 통계·지도 테마)

---

## 4. 핵심 사용자 흐름 (v1)

> 앱 첫 진입 화면은 **메인 지도 탭**(프로필 아님). 하단 탭바: 지도 / +(작성) / 프로필.

1. **첫 기록**: 가입 → username 온보딩 → 메인 지도 → 나라 탭 → 색 자동 칠 → 나라 상세 → +(작성) → 지도 핀으로 위치 지정(필수, 나라는 핀 좌표에서 자동 파생 — 도시 선택 없음, 대신 자유 지명 직접 입력) → 사진 다중 첨부 + 대표 지정 → 글 → 공개범위 선택(기본 전체공개) → 저장 (장소 검색/지오코딩은 v1.1, 8.4 참고)
2. **내 지도 보기**: 메인 지도 탭(나라 단위 색칠된 세계지도) → 나라 탭 → 나라 상세(사진 그리드, 나라 전체 게시물 — 도시별 필터는 만들지 않음, 5장 참고)
3. **가시성 관리**: 게시물 상세 → 공개범위 변경 / 프로필 → 설정(톱니) → 계정 공개범위 변경

---

## 5. 장소 기록 방식 (확정, 2026-07-02 게시물 모델 확정으로 갱신 — C-2-3a)
- **게시물 모델**: **도시 구분 없음.** 나라(`country_code`, 필수) 안에 자유 핀(`location`, 필수) + 사용자가 직접 쓰는 지명(`place_label`, 옵셔널)이 합쳐져 게시물 하나가 된다. 한 나라 안에 게시물이 여러 개 있을 수 있다.
- **나라**: 필수. v1은 자유 핀 좌표를 역지오코딩해 `country_code`를 자동 파생한다(C-2-2b) — 사용자가 나라를 직접 고르지 않는다.
- **도시(`cities` 테이블)**: 구조적 엔티티로 쓰지 않기로 확정. `cities`/`posts.city_id`는 스키마상 남아있지만(재검토 여지만 남겨둠) v1 흐름에서는 사용하지 않는다. 자유 지명은 `place_label`로 기록(데이터 출처 없음, 사용자 직접 입력).
- **도시 안 개별 위치**: 자유 핀(위경도), 필수. 사용자가 지도 아무 위치나 찍어 게시물 부착.
- **프로필 필터(방향만 확정)**: 프로필에서 모든 나라의 내 게시물을 보고 나라/날짜 등으로 필터링하는 기능은 별도 단계로 예정. `country_code`·`created_at`이 이미 있어 데이터는 준비됨 — 지금 범위 아님.
- 루트: 같은 나라 내 게시물을 `taken_at`(촬영/방문 시각) 기준으로 정렬해 선으로 잇는다 → **별도 테이블 없이 계산으로 도출**(MVP, v1.1). 나중에 명시적 루트 편집이 필요하면 `routes` 테이블 추가.

---

## 6. 디자인 시스템 (디자인 단계 확정)
- **톤**: 흰 배경 기반, 미니멀.
- **액센트 컬러**: 주황 `#ff6a2b`. 이건 **앱 테마색**이다 — 도시에 칠하는 색(사용자가 도시별로 고르는 색)과는 **무관**하다.
- **모서리**: 둥근 모서리(rounded).
- **폰트**: Pretendard.
- **기준 캔버스**: 모바일 390×844 (iPhone 기준).

---

## 7. 앱 구조 / 네비게이션 (디자인 단계 확정)
- **하단 탭바 3개**: 지도 / +(작성) / 프로필.
- **탐색(돋보기) 탭 자리는 비워둔다** → v1.1에서 추가(친구·남의 프로필과 함께).
- **첫 진입 화면 = 메인 지도 탭**(프로필 아님).

---

## 8. 화면별 사양 (v1 — 디자인 단계 확정)

### 8.1 메인 지도
- **choropleth(면) 색칠**: 나라 영역을 면으로 칠한다 (**나라 단위**, ISO 3166-1 / Natural Earth GeoJSON 경계).
- **평면지도 ↔ 3D 지구본 토글 (v1.1)**: v1은 토글 버튼만 노출, 실제 3D 전환 동작은 없음.
- 우측 **줌 컨트롤**.

### 8.2 나라 상세
- **진입**: 세계지도에서 나라 탭.
- **상단**: 접힌 지도 미리보기(탭하면 펼쳐짐).
- **메인**: **인스타 탐색식 정사각형 사진 그리드**(이 화면의 핵심) — 그 나라의 전체 게시물(`posts.country_code` 조회). **도시 구분 없음 확정**(5장, C-2-3a) — 도시별 드롭다운 필터는 만들지 않는다.
- **나라 색 선택**: 더보기(**…**) 메뉴 안. 이 색은 *세계지도에서 그 나라 영역에 칠해지는 색*(`country_visits.color`)이며 앱 테마색(주황)과 무관.
  - **v1**: 고정 팔레트 8색 중에서만 선택(무료). 컬러휠·그라데이션·hex 직접입력은 **v1.2 유료 잠금해제**(소액 결제) — v1에서는 만들지 않는다.

### 8.3 게시물 그리드 (공통 컴포넌트)
- **인스타식 정사각형 사진 그리드**. 나라 상세·프로필이 **같은 컴포넌트를 재사용**한다.

### 8.4 작성 (+)
- **위치 지정**: 지도 핀, 필수. 핀 좌표를 역지오코딩해 `country_code`를 자동으로 채운다(C-2-2b) — 사용자가 나라를 따로 입력할 필요 없음. 장소 검색(지오코딩으로 주소·지명 검색해 핀 찍기)은 **v1.1** — v1은 핀 + 자유 지명(`place_label`, 옵셔널) 직접 입력만 지원.
- **도시 선택 없음**: 도시는 구조적 엔티티로 만들지 않기로 확정(5장, C-2-3a). 대신 자유 지명(`place_label`, 옵셔널)을 사용자가 직접 입력.
- **사진 다중 첨부 + 대표 지정**. (대표 = 그리드/썸네일 커버. `post_media.order_index = 0`을 커버로 사용, 스키마 변경 없음.)
- **공개범위**: 가로 세그먼트 토글, 기본값 **'전체공개(public)'**.

### 8.5 프로필 (내 프로필)
- **통계**: 방문 나라 / 게시물 수. (도시 구분 없음 확정 — "방문 도시 수"는 집계하지 않음, 5장 참고)
- **내 사진 그리드**(8.3 공통 컴포넌트 재사용).
- **미니 지도 없음** — 하단 지도 탭과 중복이라 제거. (남의 프로필의 색칠 지도는 v1.1.)
- **계정 공개범위**는 **설정(톱니)** 안에 둔다.

### 8.6 로그인 / 온보딩
- **소셜 로그인**:
  - 한국: 카카오 · 네이버 · Apple · Google · 이메일 (**카카오 최상단 우선**).
  - 글로벌: Apple · Google 중심.
- **username 2단계 온보딩**: 유니크, **실시간 중복 체크**.

---

## 9. 데이터 모델

### 9.1 엔티티 개요
- `profiles` — 사용자 프로필 (Supabase auth.users 확장)
- `friendships` — 상호 친구 관계 (요청/수락 상태 포함)
- `cities` — 사전 정의 도시 참조 데이터
- `country_visits` — 사용자가 색칠한 나라 (지도 색칠의 원천, ISO 3166-1)
- `posts` — 게시물 (도시 + 자유 핀 위치 + 가시성)
- `post_media` — 게시물의 사진들 (1:N)
- `post_likes` — 좋아요
- `comments` — 댓글 (대댓글 지원)
- (v1.2) `owned_colors`, `subscriptions` — 수익화

### 9.2 SQL 스키마 (Postgres + PostGIS)

```sql
-- 확장
create extension if not exists postgis;
create extension if not exists citext;

-- 열거형
create type profile_visibility as enum ('public', 'private');
create type post_visibility    as enum ('public', 'friends', 'private');
create type friendship_status  as enum ('pending', 'accepted');

-- 프로필 (auth.users 1:1 확장)
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext unique not null,
  display_name  text,
  bio           text,
  avatar_url    text,
  visibility    profile_visibility not null default 'public',
  created_at    timestamptz not null default now()
);

-- 친구 관계 (무방향 1행: 낮은 uuid를 user_low에 저장해 중복 방지)
create table friendships (
  user_low     uuid not null references profiles(id) on delete cascade,
  user_high    uuid not null references profiles(id) on delete cascade,
  status       friendship_status not null default 'pending',
  requested_by uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);

-- 친구 여부 헬퍼 (정렬해서 조회)
create or replace function are_friends(a uuid, b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and user_low  = least(a, b)
      and user_high = greatest(a, b)
  );
$$;

-- 도시 참조 데이터 (사전 정의)
create table cities (
  id            bigint primary key,        -- 예: GeoNames id
  name          text not null,
  country_code  char(2) not null,
  admin_region  text,
  centroid      geography(point, 4326) not null,
  created_at    timestamptz not null default now()
);
create index cities_centroid_gix on cities using gist (centroid);

-- 색칠한 나라 (지도 색칠의 원천, 마이그레이션: country_based_coloring)
create table country_visits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  country_code char(2) not null,                 -- ISO 3166-1 alpha-2
  color        text not null default '#3B82F6',  -- 사용자가 나라별로 선택
  created_at   timestamptz not null default now(),
  unique (user_id, country_code)
);
create index country_visits_user_idx on country_visits (user_id);

-- 게시물 (나라 + 자유 핀 위치 + 가시성; 도시는 v1.1까지 옵셔널 — C-2-2a)
-- country_code: v1은 location(핀 좌표) 역지오코딩으로 자동 파생(C-2-2b), 계속 NOT NULL.
-- city_id: nullable — cities 데이터가 채워지는 v1.1에서 도시 기반 파생으로 전환 예정.
-- place_label: 자유 지역명(인스타 위치태그식), 옵셔널 — cities 구조화 대신 채택(C-2-3a).
create table posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  city_id      bigint references cities(id),      -- nullable (v1.1까지 옵셔널)
  country_code char(2) not null,                   -- 핀 좌표에서 자동 파생, 필수
  location     geography(point, 4326) not null,  -- 자유 핀
  place_label  text,                              -- 자유 지역명, 옵셔널
  caption      text,
  visibility   post_visibility not null default 'public',
  taken_at     timestamptz,                       -- 루트 정렬 기준
  created_at   timestamptz not null default now()
);
create index posts_user_idx        on posts (user_id);
create index posts_city_idx        on posts (city_id);
create index posts_country_idx     on posts (country_code, user_id);
create index posts_location_gix    on posts using gist (location);

-- 게시물 사진 (1:N, 순서 있음)
-- 메모: 사진 다중 첨부(v1) · 순서 재정렬(v1.1)은 이 1:N 구조와 order_index로
--       이미 DB 준비 완료. 두 기능 모두 스키마 변경 없이 UI만 추가하면 된다.
create table post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  url         text not null,
  width       int,
  height      int,
  order_index int not null default 0
);
create index post_media_post_idx on post_media (post_id);

-- 좋아요
create table post_likes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 댓글 (대댓글 지원)
create table comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now()
);
create index comments_post_idx on comments (post_id);
```

### 9.3 Row-Level Security (가시성 모델을 DB가 강제)

> 클라이언트 코드가 아니라 **DB가** 권한을 강제해야 안전하다. 위 2.4 판정 로직을 그대로 정책으로 옮긴다.

```sql
alter table posts enable row level security;

-- 본인 글: 전체 권한
create policy posts_owner_all on posts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 읽기: 가시성 판정 로직
create policy posts_select_visible on posts
  for select using (
    user_id = auth.uid()
    or (
      visibility = 'public'
      and (
        (select visibility from profiles where id = posts.user_id) = 'public'
        or are_friends(auth.uid(), user_id)
      )
    )
    or (
      visibility = 'friends'
      and are_friends(auth.uid(), user_id)
    )
    -- visibility = 'private' 는 본인만 (위 owner 정책)
  );
```

(profiles, comments, post_likes, post_media 등도 동일 원칙으로 정책을 단다. media/likes/comments는 "부모 post가 보이면 보인다"로 연결.)

### 9.4 핵심 PostGIS 쿼리 예시

```sql
-- 한 나라의 게시물 전체 (나라 상세 기본 그리드)
select * from posts where country_code = $1 order by taken_at nulls last;

-- (도시 드롭다운 필터 쿼리는 삭제됨 — 도시 구분 없음 확정, 5장/10장 결정 로그 참고)

-- 프로필: 내 게시물을 나라별로 필터 (방향만 확정, v1.1 후보 — 5장 참고)
select * from posts where user_id = auth.uid() and country_code = $1 order by created_at desc;

-- 프로필: 내 게시물을 날짜 범위로 필터 (방향만 확정, v1.1 후보 — 5장 참고)
select * from posts where user_id = auth.uid() and created_at between $1 and $2 order by created_at desc;

-- 내 근처 여행 기록 (반경 5km)
select * from posts
where st_dwithin(location, st_makepoint($lng,$lat)::geography, 5000)
order by location <-> st_makepoint($lng,$lat)::geography
limit 50;

-- 돋보기 피드 (public 작성자의 public 글 + 친구 글)
select p.* from posts p
join profiles pr on pr.id = p.user_id
where (pr.visibility = 'public' and p.visibility = 'public')
   or (are_friends(auth.uid(), p.user_id) and p.visibility in ('public','friends'))
order by p.created_at desc;
```

### 9.5 Storage 보안 설계 (post-media 버킷)

> 결정: 2026-07-01 (C-2-1a). 마이그레이션: `supabase/migrations/20260701100000_post_media_storage.sql`

- **버킷**: `post-media`, **private**(`public = false`). URL이 유출돼도 그 자체로는 접근 불가.
- **경로 규칙**: `posts/{user_id}/{post_id}/{파일명}`
- **조회 보안 = B 방식**: Storage 정책은 "인증 유저"까지만 열어준다. 실제 가시성(public/friends/private) 판정은 **posts 테이블 RLS**(`posts_select_visible`, 9.3)가 담당한다. 사진 URL을 얻으려면 먼저 해당 `post_media`/`posts` 행을 select할 수 있어야 하는데, 그 posts 행이 RLS에 막히면 URL 자체를 얻지 못하므로 Storage 단에서 가시성 로직을 중복 구현하지 않는다.
- **조회 방식**: signed URL, 만료 1시간. 발급 로직은 C-2-1c.
- **storage.objects 정책** (전부 `bucket_id = 'post-media'`로 한정):
  - INSERT: 인증 유저이고 경로의 user_id 세그먼트(`(storage.foldername(name))[2]`)가 `auth.uid()`와 일치할 때만 — 본인 폴더에만 업로드.
  - SELECT: 인증 유저면 허용(세부 가시성은 위 B 방식대로 posts RLS가 게이트키핑).
  - UPDATE / DELETE: 본인 폴더만.
- **미해결(C-2-1b에서 결정)**: 이미지 업로드 최대 장수/용량, 압축 정책 → 확정되면 `storage.buckets.file_size_limit`/`allowed_mime_types` 설정하는 마이그레이션 추가.

---

## 10. 미해결/다음 결정 사항
- 이미지 업로드 최대 장수/용량, 압축 정책 — 저장 위치·보안 정책은 결정됨(9.5 참고), 장수/용량/압축 수치는 C-2-1b에서 결정
- 도시 참조 데이터 규모 (전 세계 인구 N만 이상 도시? 큐레이션?)
- 신고/차단 기능 (소셜 앱이면 스토어 심사상 사실상 필요 — v1.1 권장)
- 푸시 알림 (좋아요/댓글/친구요청) — v1.1

### 결정됨

- **posts.city_id 옵셔널화** (2026-07-01, C-2-2a): cities 테이블이 거의 비어 있어 v1에서 도시 선택을 강제할 수 없음 → `city_id`를 nullable로 변경, `country_code`(나라)는 계속 NOT NULL 유지. 나라는 핀 좌표 역지오코딩으로 자동 파생(C-2-2b). 도시 선택 UI·city_id 기반 파생은 v1.1(cities 데이터가 채워진 뒤) 부활 예정. (5장, 8.4, 9.2 참고)
- **posts.place_label 추가** (2026-07-02, C-2-3a): 도시는 구조적 `cities` 엔티티로 만들지 않기로 결정. 위치는 핀(`location`)+나라(`country_code`) 필수 + 자유 지역명(`place_label`) 옵셔널로 남긴다(인스타 위치태그식). 필요해지면 나중에 지오코딩 기반 정규화로 업그레이드할 수 있으나, `cities` 데이터 자체를 채우는 방향은 가지 않는다. (9.2 참고)
- **게시물 모델 확정** (2026-07-02, C-2-3a): 도시 구분 없음. 나라(`country_code`) 안에 자유 핀(`location`) + 사용자 명명 지명(`place_label`)이 하나의 게시물이며, 한 나라 안에 게시물이 여러 개 존재할 수 있다. 파생 효과: 나라상세의 도시 드롭다운 필터(8.2), 작성 화면 도시 선택(8.4), v1.1 루트 선(도시 단위 → 나라 단위)을 전부 이 모델에 맞춰 갱신. (4, 5, 8.2, 8.4장 참고)
- **프로필 나라/날짜 필터 방향** (2026-07-02): 프로필에서 모든 나라의 내 게시물을 보고 나라/날짜 등으로 필터링하는 기능은 별도 단계로 예정. `country_code`·`created_at` 컬럼이 이미 있어 데이터는 준비되어 있지만, 필터 UI 자체는 지금 범위 밖(v1.1 후보). (5, v1.1 목록 참고)

### 결정됨 (디자인 단계)
- **소셜 로그인 범위 확정**: 한국 = 카카오·네이버·Apple·Google·이메일(카카오 우선), 글로벌 = Apple·Google 중심. (8.6 참고)
- **디자인 토큰 확정**: 흰 배경 / 주황 `#ff6a2b` / 둥근 모서리 / Pretendard / 390×844. (6 참고)
- **네비게이션 확정**: 하단 탭 3개(지도/+/프로필), 첫 화면 = 지도. (7 참고)
- **프로필 미니 지도 제거**(지도 탭과 중복). 남의 프로필 색칠 지도는 v1.1.
- **색칠 단위 나라로 변경**: 도시 단위 choropleth → 나라 단위. 나라 경계는 Natural Earth(퍼블릭 도메인) GeoJSON. 도시 경계 폴리곤 불필요 → 해당 미해결 항목 해소.

---

## 11. 다음 산출물
1. 프로젝트 폴더 구조 & 윈도우 개발 환경 셋업 가이드 (Node·Expo·EAS) ✅
2. Supabase 프로젝트 셋업 + 위 스키마 마이그레이션 적용 ✅
3. 화면 와이어프레임 (Claude Design) ✅ — 본 문서 6~8장에 반영
4. 첫 코드 — 인증 + 지도 화면 (Claude Code)
