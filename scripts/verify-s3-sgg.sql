-- Phase S-3 검증: sgg 경계 테이블 + posts.sgg_id + 판정 트리거
--
-- 2용도 스크립트 (verify-comments-rls.sql 과 같은 형태):
--   · db push 전  = [PART A] 에 마이그레이션 DDL 이 인라인돼 있어 라이브 DB에서
--                   결과를 미리 볼 수 있다. 전체 rollback 이라 실데이터 무오염.
--   · db push 후  = [PART A] 블록만 통째로 주석 처리하면 그대로 회귀 테스트가 된다.
--
-- ⚠️ 회귀 실행 시 [PART A] 만 주석 처리하면 된다. 이 스크립트는 "적용 전 상태"를
--    기록하는 행이 없어서 verify-s1-city-cleanup.sql 같은 추가 주의사항은 없다.
--
-- ⚠️ 실제 230행 경계는 넣지 않는다. 트리거 로직 검증에는 합성 사각형 2개면
--    충분하고, 7.3MB 를 트랜잭션에 밀어넣을 이유가 없다.
--
-- 실행: npx supabase db query --linked -f scripts/verify-s3-sgg.sql

begin;

create temp table r(step text, expect text, got text, ok boolean) on commit drop;
-- C 섹션은 role 을 authenticated 로 바꾼 뒤에도 결과를 적어야 한다.
grant insert, select on r to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- [PART A] 마이그레이션 DDL (db push 후 회귀 실행 시 이 블록만 주석 처리)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.sgg (
  id              uuid primary key default gen_random_uuid(),
  osm_relation_id bigint      not null unique,
  sgg_code        char(5),
  name            text        not null,
  admin_level     smallint    not null,
  code_source     text,
  geom            geography(MultiPolygon, 4326) not null,
  created_at      timestamptz not null default now(),
  constraint sgg_code_source_check
    check (code_source is null or code_source in ('osm', 'manual')),
  constraint sgg_admin_level_check check (admin_level in (4, 6))
);
create index if not exists sgg_geom_idx on public.sgg using gist (geom);
create unique index if not exists sgg_code_uniq
  on public.sgg (sgg_code) where sgg_code is not null;
alter table public.sgg enable row level security;
drop policy if exists sgg_select_all on public.sgg;
create policy sgg_select_all on public.sgg for select using (true);
grant select on public.sgg to authenticated;
alter table public.posts
  add column if not exists sgg_id uuid references public.sgg(id) on delete set null;
create index if not exists posts_sgg_idx on public.posts (sgg_id, user_id);
create or replace function public.set_post_sgg()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  select s.id into new.sgg_id from public.sgg s
   where st_covers(s.geom, new.location) limit 1;
  return new;
end;
$$;
drop trigger if exists posts_set_sgg on public.posts;
create trigger posts_set_sgg before insert or update on public.posts
  for each row execute function public.set_post_sgg();
-- ═══════════════════════════════════════════════════════ [PART A] 끝 ═══════

-- ── 합성 경계 2개 ────────────────────────────────────────────────────────────
-- ⚠️ 반드시 한국에서 멀리 떨어진 태평양 한가운데에 둔다.
--    처음엔 서울 근처(126~129E)에 뒀다가, 실제 230행이 적재된 뒤 회귀 실행에서
--    합성 사각형이 진짜 시군구(영종구·평창군)와 겹쳐 5개 항목이 오탐으로 깨졌다.
--    트리거는 st_covers 매칭을 limit 1 로 하나만 고르므로, 겹치면 어느 쪽이
--    잡힐지 알 수 없다.
insert into public.sgg (osm_relation_id, sgg_code, name, admin_level, code_source, geom)
values
 (-101, 'T0001', '테스트구A', 6, 'osm',
  st_geomfromtext('MULTIPOLYGON(((160 0,161 0,161 1,160 1,160 0)))', 4326)::geography),
 (-102, null,    '테스트구B', 6, null,
  st_geomfromtext('MULTIPOLYGON(((162 0,163 0,163 1,162 1,162 0)))', 4326)::geography);

-- 테스트용 게시물 주인(기존 프로필 아무나)
create temp table who on commit drop as select id from public.profiles limit 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- A. 스키마 / 제약
-- ═══════════════════════════════════════════════════════════════════════════
insert into r
select 'A1 sgg 테이블 존재', 'true',
       (to_regclass('public.sgg') is not null)::text,
       to_regclass('public.sgg') is not null;

insert into r
select 'A2 sgg_code nullable', 'YES', is_nullable, is_nullable = 'YES'
from information_schema.columns
where table_schema='public' and table_name='sgg' and column_name='sgg_code';

insert into r
select 'A3 geom 타입', 'geography', udt_name, udt_name = 'geography'
from information_schema.columns
where table_schema='public' and table_name='sgg' and column_name='geom';

insert into r
select 'A4 GIST 인덱스', 'true',
       (count(*) > 0)::text, count(*) > 0
from pg_indexes where schemaname='public' and tablename='sgg' and indexdef ilike '%gist%';

insert into r
select 'A5 posts.sgg_id 존재', 'YES', is_nullable, is_nullable='YES'
from information_schema.columns
where table_schema='public' and table_name='posts' and column_name='sgg_id';

insert into r
select 'A6 posts_sgg_idx 존재', 'true', (count(*)>0)::text, count(*)>0
from pg_indexes where schemaname='public' and tablename='posts' and indexname='posts_sgg_idx';

insert into r
select 'A7 FK on delete set null', 'a', confdeltype, confdeltype = 'n'
from pg_constraint
where conrelid='public.posts'::regclass and contype='f'
  and confrelid='public.sgg'::regclass;

-- 중복 코드 거부
do $$
begin
  insert into public.sgg(osm_relation_id, sgg_code, name, admin_level, geom)
  values (-103,'T0001','중복코드',6,
          st_geomfromtext('MULTIPOLYGON(((1 1,2 1,2 2,1 2,1 1)))',4326)::geography);
  insert into r values('A8 sgg_code 중복 거부','거부','통과됨',false);
exception when unique_violation then
  insert into r values('A8 sgg_code 중복 거부','거부','거부됨',true);
end $$;

-- 코드 없는 행은 여러 개 허용되어야 한다(인천 신설 4개)
do $$
begin
  insert into public.sgg(osm_relation_id, sgg_code, name, admin_level, geom)
  values (-104,null,'코드없음2',6,
          st_geomfromtext('MULTIPOLYGON(((3 3,4 3,4 4,3 4,3 3)))',4326)::geography);
  insert into r values('A9 코드 null 다중 허용','허용','허용됨',true);
exception when others then
  insert into r values('A9 코드 null 다중 허용','허용','거부됨('||sqlerrm||')',false);
end $$;

-- admin_level / code_source CHECK
do $$
begin
  insert into public.sgg(osm_relation_id, name, admin_level, geom)
  values (-105,'잘못된레벨',7,
          st_geomfromtext('MULTIPOLYGON(((5 5,6 5,6 6,5 6,5 5)))',4326)::geography);
  insert into r values('A10 admin_level 7 거부','거부','통과됨',false);
exception when check_violation then
  insert into r values('A10 admin_level 7 거부','거부','거부됨',true);
end $$;

do $$
begin
  insert into public.sgg(osm_relation_id, name, admin_level, code_source, geom)
  values (-106,'잘못된소스',6,'guess',
          st_geomfromtext('MULTIPOLYGON(((7 7,8 7,8 8,7 8,7 7)))',4326)::geography);
  insert into r values('A11 code_source 임의값 거부','거부','통과됨',false);
exception when check_violation then
  insert into r values('A11 code_source 임의값 거부','거부','거부됨',true);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. 판정 트리거
-- ═══════════════════════════════════════════════════════════════════════════
-- B1: 경계 안 점 -> 자동 판정
with ins as (
  insert into public.posts(user_id, location, country_code, visibility, caption)
  select id, st_setsrid(st_makepoint(160.5, 0.5),4326)::geography, 'KR', 'private', 's3-b1'
  from who returning sgg_id
)
insert into r
select 'B1 경계 안 -> 자동 판정', '테스트구A',
       coalesce((select name from public.sgg where id=(select sgg_id from ins)),'(null)'),
       (select name from public.sgg where id=(select sgg_id from ins)) = '테스트구A';

-- B2: 경계 밖 점 -> null
with ins as (
  insert into public.posts(user_id, location, country_code, visibility, caption)
  select id, st_setsrid(st_makepoint(170.0, 0.5),4326)::geography, 'JP', 'private', 's3-b2'
  from who returning sgg_id
)
insert into r
select 'B2 경계 밖 -> null', 'null',
       coalesce((select sgg_id::text from ins),'null'),
       (select sgg_id from ins) is null;

-- B3: 앱이 sgg_id 를 위조해 넣어도 서버 판정으로 덮어써진다
with ins as (
  insert into public.posts(user_id, location, country_code, visibility, caption, sgg_id)
  select id, st_setsrid(st_makepoint(162.5, 0.5),4326)::geography, 'KR', 'private', 's3-b3',
         (select id from public.sgg where osm_relation_id=-101)   -- A 라고 거짓말
  from who returning sgg_id
)
insert into r
select 'B3 INSERT 위조 덮어쓰기', '테스트구B',
       coalesce((select name from public.sgg where id=(select sgg_id from ins)),'(null)'),
       (select name from public.sgg where id=(select sgg_id from ins)) = '테스트구B';

-- B4: 캡션만 UPDATE 하면서 sgg_id 를 심어도 덮어써진다
update public.posts
   set caption = 's3-b4', sgg_id = (select id from public.sgg where osm_relation_id=-102)
 where caption = 's3-b1';
insert into r
select 'B4 UPDATE 위조 덮어쓰기', '테스트구A',
       coalesce((select s.name from public.posts p join public.sgg s on s.id=p.sgg_id
                  where p.caption='s3-b4'),'(null)'),
       (select s.name from public.posts p join public.sgg s on s.id=p.sgg_id
         where p.caption='s3-b4') = '테스트구A';

-- B5: 위치를 옮기면 재판정된다
update public.posts
   set location = st_setsrid(st_makepoint(162.5,0.5),4326)::geography
 where caption = 's3-b4';
insert into r
select 'B5 위치 이동 시 재판정', '테스트구B',
       coalesce((select s.name from public.posts p join public.sgg s on s.id=p.sgg_id
                  where p.caption='s3-b4'),'(null)'),
       (select s.name from public.posts p join public.sgg s on s.id=p.sgg_id
         where p.caption='s3-b4') = '테스트구B';

-- B6: 경계 행이 사라져도 게시물은 남고 sgg_id 만 null 이 된다
delete from public.sgg where osm_relation_id = -102;
insert into r
select 'B6 경계 삭제 -> set null, 글 유지', 'null/살아있음',
       coalesce((select sgg_id::text from public.posts where caption='s3-b4'),'null')
         ||'/'|| (select count(*)::text from public.posts where caption='s3-b4'),
       (select sgg_id from public.posts where caption='s3-b4') is null
        and (select count(*) from public.posts where caption='s3-b4') = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- C. RLS (authenticated 로 전환)
-- ═══════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

insert into r
select 'C1 authenticated SELECT 가능', '>0',
       (select count(*)::text from public.sgg),
       (select count(*) from public.sgg) > 0;

do $$
begin
  insert into public.sgg(osm_relation_id, name, admin_level, geom)
  values (-107,'해커구',6,
          st_geomfromtext('MULTIPOLYGON(((9 9,10 9,10 10,9 10,9 9)))',4326)::geography);
  insert into r values('C2 authenticated INSERT 차단','차단','통과됨',false);
exception when insufficient_privilege then
  insert into r values('C2 authenticated INSERT 차단','차단','차단됨',true);
  when others then
  insert into r values('C2 authenticated INSERT 차단','차단','차단됨('||sqlerrm||')',true);
end $$;

do $$
begin
  update public.sgg set name='탈취' where osm_relation_id=-101;
  insert into r values('C3 authenticated UPDATE 차단','차단',
    'affected='||(select count(*) from public.sgg where name='탈취')::text,
    (select count(*) from public.sgg where name='탈취') = 0);
exception when insufficient_privilege then
  insert into r values('C3 authenticated UPDATE 차단','차단','차단됨',true);
  when others then
  insert into r values('C3 authenticated UPDATE 차단','차단','차단됨('||sqlerrm||')',true);
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════
select step,
       expect,
       got,
       case when ok then 'OK' else '*** FAIL ***' end as result
from r order by step;

rollback;
