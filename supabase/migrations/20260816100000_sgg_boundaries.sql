-- Phase S-3: 한국 시군구 경계 테이블 + posts.sgg_id + 서버측 판정 트리거
--
-- 경계 데이터는 OpenStreetMap(ODbL 1.0) 파생물이다. 출처/라이선스 고지는
-- data/kr-sgg/README.md 참고. 실제 230행 적재는 data/kr-sgg/load_to_db.py 가 한다
-- (7.3MB라 마이그레이션에 인라인하지 않는다).

-- ── 1. 경계 테이블 ────────────────────────────────────────────────────────────
-- ⚠️ 식별자 설계: 행정구역 개편 시 sgg_code(5자리)는 값 자체가 바뀐다
--    (군위군 대구 편입으로 47720 -> 27720). 그래서 코드를 자연키로 쓰지 않고
--    surrogate id 를 PK 로 둔다. 방문 기록/게시물은 이 id 만 참조하므로
--    코드가 바뀌어도 기록이 깨지지 않는다.
create table if not exists public.sgg (
  id              uuid primary key default gen_random_uuid(),
  -- 갱신(연 1회 재추출) 시 매칭 키. 코드가 없는 신설 구도 이걸로 추적된다.
  osm_relation_id bigint      not null unique,
  -- ⚠️ NOT NULL 금지: 2026-07-01 신설된 인천 4개 구(제물포/영종/서해/검단)는
  --    MOIS 고시 코드가 아직 확인되지 않아 null 이다. 추측값을 넣지 말 것.
  sgg_code        char(5),
  name            text        not null,
  -- 6 = 시군구, 4 = 세종특별자치시(시군구 레이어에 없어 별도 병합한 것)
  admin_level     smallint    not null,
  -- 'osm' = OSM 태그 그대로 / 'manual' = 수기 보정(울산 5개) / null = 결측
  code_source     text,
  -- ⚠️ 미클립(해상 경계 포함) 원본을 넣는다. 해변·부두·선상 좌표가 NULL 로
  --    떨어지지 않게 하기 위함이고, 관할 해역은 행정적으로도 그 시군구 소관이다.
  --    바다가 칠해지는 문제는 렌더링용 번들에서만 클립해 해결한다(S-5).
  geom            geography(MultiPolygon, 4326) not null,
  created_at      timestamptz not null default now(),
  constraint sgg_code_source_check
    check (code_source is null or code_source in ('osm', 'manual')),
  constraint sgg_admin_level_check check (admin_level in (4, 6))
);

comment on table public.sgg is
  '한국 시군구 경계 (OpenStreetMap, ODbL 1.0). 고지: data/kr-sgg/README.md';

-- 점 판정(ST_Covers)용. 이 테이블의 유일한 조회 패턴이다.
create index if not exists sgg_geom_idx on public.sgg using gist (geom);
-- 코드는 있을 때만 유일해야 한다(결측 4행이 서로 충돌하면 안 됨).
create unique index if not exists sgg_code_uniq
  on public.sgg (sgg_code) where sgg_code is not null;

-- ── 2. RLS: 읽기 전용 참조 데이터 ────────────────────────────────────────────
-- 앱은 절대 쓰지 않는다. 쓰기 정책을 만들지 않는 것으로 강제한다.
alter table public.sgg enable row level security;

drop policy if exists sgg_select_all on public.sgg;
create policy sgg_select_all on public.sgg for select using (true);

grant select on public.sgg to authenticated;

-- ── 3. posts.sgg_id ──────────────────────────────────────────────────────────
-- on delete set null: 행정구역 개편으로 경계 행이 사라져도 게시물은 남아야 한다.
alter table public.posts
  add column if not exists sgg_id uuid references public.sgg(id) on delete set null;

-- Phase N 의 posts_country_idx 와 같은 목적 — S-4 방문 테이블 RLS 의
-- exists(...) 서브쿼리가 이 인덱스를 탄다.
create index if not exists posts_sgg_idx on public.posts (sgg_id, user_id);

-- ── 4. 판정 트리거 ───────────────────────────────────────────────────────────
-- ⭐ 나라(country_code)와 달리 시군구는 서버가 판정한다. 앱이 넣은 값은 항상
--    덮어쓴다 — 클라이언트가 sgg_id 를 위조할 수 없게 하기 위함이다.
-- ⚠️ country_code 를 조건으로 쓰지 않는다. country_code 자체가 클라이언트
--    파생값이라 신뢰할 수 없고, sgg 에는 한국 경계만 있으므로 국외 좌표는
--    자연히 매칭 0건 -> null 이 된다.
-- security invoker: sgg 는 select using(true) + authenticated 에 grant 가
--    있으므로 정의자 권한이 불필요하다(G-1 트리거와 같은 판단).
create or replace function public.set_post_sgg()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select s.id
    into new.sgg_id
    from public.sgg s
   where st_covers(s.geom, new.location)
   limit 1;
  return new;
end;
$$;

-- update 를 location 변경으로 한정하지 않는다. 그렇게 하면 캡션만 바꾸는
-- update 에 sgg_id 를 실어 보내 값을 심을 수 있다.
drop trigger if exists posts_set_sgg on public.posts;
create trigger posts_set_sgg
  before insert or update on public.posts
  for each row execute function public.set_post_sgg();
