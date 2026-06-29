-- =============================================================
-- 세계지도 색칠 단위: 도시 → 나라 변경
--
-- 변경 내용:
--   1. city_visits 제거 (실데이터 없음, 초기 스키마와 함께 교체)
--   2. country_visits 신설 — 나라 단위 색칠 (ISO 3166-1 alpha-2)
--   3. posts.country_code 추가 (NOT NULL) — 작성 시 city_id → cities.country_code 에서
--      앱이 자동 파생; 사용자가 따로 입력하지 않음
--
-- 기준 문서: docs/PRD.md 9장
-- =============================================================

-- ---------- 1. city_visits 제거 ----------
drop table if exists city_visits;

-- ---------- 2. country_visits ----------
create table country_visits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  country_code char(2) not null,                 -- ISO 3166-1 alpha-2
  color        text not null default '#3B82F6',  -- 사용자가 나라별로 선택
  created_at   timestamptz not null default now(),
  unique (user_id, country_code)
);
create index country_visits_user_idx on country_visits (user_id);

-- RLS
alter table country_visits enable row level security;

-- 본인: 전체 권한
create policy country_visits_owner_all on country_visits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 남의 색칠 보기: 작성자가 public이거나 나와 친구일 때
create policy country_visits_select_visible on country_visits
  for select to authenticated
  using (
    user_id = auth.uid()
    or (select visibility from profiles where id = country_visits.user_id) = 'public'
    or are_friends(auth.uid(), user_id)
  );

-- ---------- 3. posts.country_code 추가 ----------
-- cities.country_code 는 NOT NULL (초기 스키마)이므로 파생 값 항상 보장됨.
-- 앱 작성 화면에서 도시 선택(필수) 시 cities.country_code 를 읽어 이 컬럼에 채운다.
alter table posts add column country_code char(2) not null;
create index posts_country_idx on posts (country_code, user_id);
