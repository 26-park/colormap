# 여행기록 SNS — 제품 정의서(PRD) & 데이터베이스 설계

> 버전 0.1 · 작성 기준: v1 MVP 출시를 향한 설계 문서
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
- 세계지도에서 가본 **도시 색칠** (기본 색상만)
- 도시 누르면 → 그 안에 **위치별 사진+글 기록** (자유 핀)
- 게시물 가시성 토글 (public / friends / private)
- 계정 가시성 토글 (public / private)
- 내 프로필 = 내 지도 + 기본 통계(방문 도시 수, 나라 수)

### v1.1 — "소셜 켜기"
- 좋아요 · 댓글
- 친구(상호 수락) 요청·수락·목록
- 같은 도시 내 게시물을 **시간순 루트 선**으로 연결

### v1.2 — "발견 + 수익화"
- 탐색(돋보기) 탭 — 도시 단위 발견
- 색깔 구매(소액 결제) + 프리미엄 구독(무제한 기록·고급 통계·지도 테마)

---

## 4. 핵심 사용자 흐름 (v1)

1. **첫 기록**: 가입 → 지도에서 도시 검색/선택 → 색 자동 칠 → "이 도시에 기록 추가" → 지도 위 위치 핀 찍기 → 사진+글 → 가시성 선택 → 저장
2. **내 지도 보기**: 프로필 → 색칠된 세계지도 → 도시 탭 → 그 도시의 내 게시물 목록(핀)
3. **가시성 관리**: 게시물 상세 → 공개범위 변경 / 설정 → 계정 공개범위 변경

---

## 5. 장소 기록 방식 (확정)
- **도시**: 사전 정의된 참조 목록(`cities`)에서 선택 → 지도 색칠·통계가 정확하고 깔끔. (데이터 출처: GeoNames 등)
- **도시 안 개별 위치**: 자유 핀(위경도). 사용자가 지도 아무 위치나 찍어 게시물 부착.
- 루트: 같은 도시 내 게시물을 `taken_at`(촬영/방문 시각) 기준으로 정렬해 선으로 잇는다 → **별도 테이블 없이 계산으로 도출**(MVP). 나중에 명시적 루트 편집이 필요하면 `routes` 테이블 추가.

---

## 6. 데이터 모델

### 6.1 엔티티 개요
- `profiles` — 사용자 프로필 (Supabase auth.users 확장)
- `friendships` — 상호 친구 관계 (요청/수락 상태 포함)
- `cities` — 사전 정의 도시 참조 데이터
- `city_visits` — 사용자가 색칠한 도시 (지도 색칠의 원천)
- `posts` — 게시물 (도시 + 자유 핀 위치 + 가시성)
- `post_media` — 게시물의 사진들 (1:N)
- `post_likes` — 좋아요
- `comments` — 댓글 (대댓글 지원)
- (v1.2) `owned_colors`, `subscriptions` — 수익화

### 6.2 SQL 스키마 (Postgres + PostGIS)

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

-- 색칠한 도시 (지도 색칠의 원천)
create table city_visits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  city_id      bigint not null references cities(id),
  color        text not null default '#3B82F6',  -- 기본색
  created_at   timestamptz not null default now(),
  unique (user_id, city_id)
);
create index city_visits_user_idx on city_visits (user_id);

-- 게시물 (도시 + 자유 핀 위치 + 가시성)
create table posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  city_id      bigint not null references cities(id),
  location     geography(point, 4326) not null,  -- 자유 핀
  caption      text,
  visibility   post_visibility not null default 'public',
  taken_at     timestamptz,                       -- 루트 정렬 기준
  created_at   timestamptz not null default now()
);
create index posts_user_idx     on posts (user_id);
create index posts_city_idx     on posts (city_id);
create index posts_location_gix on posts using gist (location);

-- 게시물 사진 (1:N, 순서 있음)
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

### 6.3 Row-Level Security (가시성 모델을 DB가 강제)

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

### 6.4 핵심 PostGIS 쿼리 예시

```sql
-- 한 도시 안에서 내가 볼 수 있는 게시물 (RLS가 가시성 자동 적용)
select * from posts where city_id = $1 order by taken_at nulls last;

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

---

## 7. 미해결/다음 결정 사항
- 소셜 로그인 제공 범위 (Apple은 iOS 앱이면 사실상 필수)
- 이미지 업로드 최대 장수/용량, 압축 정책
- 도시 참조 데이터 규모 (전 세계 인구 N만 이상 도시? 큐레이션?)
- 신고/차단 기능 (소셜 앱이면 스토어 심사상 사실상 필요 — v1.1 권장)
- 푸시 알림 (좋아요/댓글/친구요청) — v1.1

---

## 8. 다음 산출물
1. 프로젝트 폴더 구조 & 윈도우 개발 환경 셋업 가이드 (Node·Expo·EAS)
2. Supabase 프로젝트 셋업 + 위 스키마 마이그레이션 적용
3. 화면 와이어프레임 (Claude Design)
4. 첫 코드 — 인증 + 지도 화면 (Claude Code)
