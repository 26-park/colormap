-- =============================================================
-- colormap 초기 스키마 + RLS
-- 기준 문서: docs/PRD.md 6장 (데이터 모델 / RLS / PostGIS)
-- 가시성 모델: docs/PRD.md 2장 & CLAUDE.md "권한/가시성 모델"
--
-- 원칙: 가시성은 클라이언트가 아니라 DB(RLS)가 강제한다.
--       모든 테이블은 RLS enable + deny-by-default. 정책으로만 열어준다.
-- =============================================================

-- ---------- 확장 ----------
create extension if not exists postgis;
create extension if not exists citext;

-- ---------- 열거형 ----------
create type profile_visibility as enum ('public', 'private');
create type post_visibility    as enum ('public', 'friends', 'private');
create type friendship_status  as enum ('pending', 'accepted');

-- =============================================================
-- 테이블
-- =============================================================

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

-- 도시 참조 데이터 (사전 정의, 예: GeoNames id)
create table cities (
  id            bigint primary key,
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
  color        text not null default '#3B82F6',
  created_at   timestamptz not null default now(),
  unique (user_id, city_id)
);
create index city_visits_user_idx on city_visits (user_id);

-- 게시물 (도시 + 자유 핀 위치 + 가시성)
create table posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  city_id      bigint not null references cities(id),
  location     geography(point, 4326) not null,
  caption      text,
  visibility   post_visibility not null default 'public',
  taken_at     timestamptz,
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

-- 좋아요 (v1.1 기능 — 테이블만 미리 둠)
create table post_likes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 댓글 (대댓글 지원, v1.1 기능 — 테이블만 미리 둠)
create table comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now()
);
create index comments_post_idx on comments (post_id);

-- =============================================================
-- 헬퍼 함수: 친구 여부
--   SECURITY DEFINER로 두어 friendships의 RLS와 무관하게 일관 판정.
--   (RLS 정책 내부에서 호출되므로 안정적이어야 함)
-- =============================================================
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and user_low  = least(a, b)
      and user_high = greatest(a, b)
  );
$$;

-- =============================================================
-- Row-Level Security
--   2.4 가시성 판정 로직을 DB 정책으로 옮긴다.
-- =============================================================

-- ---------- profiles ----------
alter table profiles enable row level security;

-- 계정 자체는 검색에 노출(2.1): 로그인 사용자는 모든 프로필 행을 볼 수 있다.
-- (게시물/내역의 가시성은 각 테이블 RLS가 따로 강제)
create policy profiles_select_all on profiles
  for select to authenticated using (true);

create policy profiles_insert_self on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- friendships ----------
alter table friendships enable row level security;

-- 당사자 둘만 행을 볼 수 있다.
create policy friendships_select_party on friendships
  for select to authenticated
  using (auth.uid() in (user_low, user_high));

-- 요청 생성: 본인이 당사자이고, 본인이 요청자.
create policy friendships_insert_party on friendships
  for insert to authenticated
  with check (requested_by = auth.uid() and auth.uid() in (user_low, user_high));

-- 수락/변경: 당사자만.
create policy friendships_update_party on friendships
  for update to authenticated
  using (auth.uid() in (user_low, user_high))
  with check (auth.uid() in (user_low, user_high));

-- 취소/삭제: 당사자만.
create policy friendships_delete_party on friendships
  for delete to authenticated
  using (auth.uid() in (user_low, user_high));

-- ---------- cities (참조 데이터) ----------
alter table cities enable row level security;

-- 누구나 읽기 가능. 쓰기는 정책 없음 → service_role(시드/관리)만 가능.
create policy cities_select_all on cities
  for select to authenticated using (true);

-- ---------- city_visits (지도 색칠) ----------
alter table city_visits enable row level security;

create policy city_visits_owner_all on city_visits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 남의 색칠 보기: 작성자가 public 이거나 나와 친구일 때.
create policy city_visits_select_visible on city_visits
  for select to authenticated
  using (
    user_id = auth.uid()
    or (select visibility from profiles where id = city_visits.user_id) = 'public'
    or are_friends(auth.uid(), user_id)
  );

-- ---------- posts ----------
alter table posts enable row level security;

-- 본인 글: 전체 권한
create policy posts_owner_all on posts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 읽기: 2.4 가시성 판정 로직
create policy posts_select_visible on posts
  for select to authenticated
  using (
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

-- ---------- post_media ----------
-- "부모 post가 보이면 보인다" — 하위 select가 posts RLS를 그대로 통과해야 보임.
alter table post_media enable row level security;

create policy post_media_select_if_post_visible on post_media
  for select to authenticated
  using (exists (select 1 from posts where posts.id = post_media.post_id));

create policy post_media_write_if_post_owner on post_media
  for all to authenticated
  using (exists (
    select 1 from posts
    where posts.id = post_media.post_id and posts.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from posts
    where posts.id = post_media.post_id and posts.user_id = auth.uid()
  ));

-- ---------- post_likes (v1.1) ----------
alter table post_likes enable row level security;

create policy post_likes_select_if_post_visible on post_likes
  for select to authenticated
  using (exists (select 1 from posts where posts.id = post_likes.post_id));

create policy post_likes_insert_self on post_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from posts where posts.id = post_likes.post_id)
  );

create policy post_likes_delete_self on post_likes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- comments (v1.1) ----------
alter table comments enable row level security;

create policy comments_select_if_post_visible on comments
  for select to authenticated
  using (exists (select 1 from posts where posts.id = comments.post_id));

create policy comments_insert_self on comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from posts where posts.id = comments.post_id)
  );

create policy comments_update_self on comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy comments_delete_self on comments
  for delete to authenticated
  using (user_id = auth.uid());
