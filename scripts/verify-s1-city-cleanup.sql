-- =============================================================
-- Phase S-1 검증 하네스 — city 잔재 정리
--
-- 사용법 (verify-comments-rls.sql 과 동일한 2용도):
--   1) db push 전 리허설  : 그대로 실행 → [PART A]가 DDL을 인라인으로 적용하고
--                           전체 rollback 하므로 라이브 DB는 오염되지 않는다.
--   2) db push 후 회귀    : [PART A] 블록 + B1·B2·B3·B5 행을 주석 처리하고 실행.
--                           ⚠️ B 행들은 "적용 전" 상태를 기록하는 행이라 적용 후에는
--                           의미가 없을 뿐 아니라, B5는 이미 사라진 posts.city_id를
--                           참조하므로 주석 처리하지 않으면 스크립트 전체가
--                           42703(column does not exist)으로 죽는다.
--                           회귀에서 판정 대상은 A 행 전부(A1~A13)이다.
--
-- 판정: 마지막 SELECT 한 방으로 전부 조회 (supabase db query 가 멀티스테이트먼트
-- 스크립트에서 마지막 statement 결과만 돌려주기 때문 — Phase N에서 확인)
-- =============================================================

begin;

create temp table s1_result(step text, expected text, actual text, ok boolean) on commit drop;

-- ---------- 적용 전 상태 기록 ----------
insert into s1_result
select 'B1 city_id 컬럼(적용전)', 'exists', coalesce((
  select 'exists' from information_schema.columns
  where table_schema='public' and table_name='posts' and column_name='city_id'), 'missing'), null;

insert into s1_result
select 'B2 cities 테이블(적용전)', 'exists', coalesce((
  select 'exists' from pg_tables where schemaname='public' and tablename='cities'), 'missing'), null;

insert into s1_result
select 'B3 뷰가 city_id 노출(적용전)', 'exists', coalesce((
  select 'exists' from information_schema.columns
  where table_schema='public' and table_name='posts_with_coords' and column_name='city_id'), 'missing'), null;

-- 데이터 손실 감시용 기준값 (정보 행 — expected를 실측값과 같게 넣어 판정에서 중립)
insert into s1_result
select 'B4 posts 행수(적용전)', (select count(*)::text from public.posts),
       (select count(*)::text from public.posts), null;

insert into s1_result
select 'B5 city_id 비어있음(사용 0건)', '0', (select count(*)::text from public.posts where city_id is not null), null;

-- ======================= [PART A] 마이그레이션 DDL 인라인 =======================
-- db push 이후 회귀 테스트로 돌릴 때는 이 블록만 통째로 주석 처리할 것.
drop view if exists posts_with_coords;
alter table posts drop column if exists city_id;
drop table if exists cities;
create view posts_with_coords
  with (security_invoker = true)
  as
  select p.*, st_x(p.location::geometry) as lng, st_y(p.location::geometry) as lat
  from posts p;
grant select on posts_with_coords to authenticated;
-- ===================== [PART A] 끝 =====================

-- ---------- 적용 후 검증 ----------
insert into s1_result
select 'A1 city_id 컬럼 제거', 'missing', coalesce((
  select 'exists' from information_schema.columns
  where table_schema='public' and table_name='posts' and column_name='city_id'), 'missing'), null;

insert into s1_result
select 'A2 cities 테이블 제거', 'missing', coalesce((
  select 'exists' from pg_tables where schemaname='public' and tablename='cities'), 'missing'), null;

insert into s1_result
select 'A3 posts_city_idx 동반 소멸', 'missing', coalesce((
  select 'exists' from pg_indexes where schemaname='public' and indexname='posts_city_idx'), 'missing'), null;

insert into s1_result
select 'A4 cities 정책 동반 소멸', '0', (
  select count(*)::text from pg_policies where schemaname='public' and tablename='cities');

insert into s1_result
select 'A5 cities 참조 FK 소멸', '0', (
  select count(*)::text from pg_constraint where conname='posts_city_id_fkey');

-- ⭐ 가장 중요: 뷰가 살아있고 security_invoker 가 유지됐는지.
-- 빠지면 posts_select_visible RLS 가 통째로 우회된다.
insert into s1_result
select 'A6 뷰 재생성됨', 'exists', coalesce((
  select 'exists' from pg_class where relname='posts_with_coords' and relkind='v'), 'missing'), null;

insert into s1_result
select 'A7 ⭐ security_invoker 유지', 'true', coalesce((
  select 'true' from pg_class
  where relname='posts_with_coords'
    and reloptions @> array['security_invoker=true']), 'MISSING!'), null;

insert into s1_result
select 'A8 뷰에서 city_id 사라짐', 'missing', coalesce((
  select 'exists' from information_schema.columns
  where table_schema='public' and table_name='posts_with_coords' and column_name='city_id'), 'missing'), null;

insert into s1_result
select 'A9 뷰 lng/lat 유지', '2', (
  select count(*)::text from information_schema.columns
  where table_schema='public' and table_name='posts_with_coords' and column_name in ('lng','lat'));

insert into s1_result
select 'A10 posts 행수 불변', (select actual from s1_result where step='B4 posts 행수(적용전)'),
       (select count(*)::text from public.posts);

insert into s1_result
select 'A11 뷰 실제 조회 가능', 'ok',
       (select case when count(*) >= 0 then 'ok' else 'fail' end from public.posts_with_coords);

insert into s1_result
select 'A12 authenticated 뷰 select 권한', 'true', coalesce((
  select 'true' from information_schema.role_table_grants
  where table_schema='public' and table_name='posts_with_coords'
    and grantee='authenticated' and privilege_type='SELECT'), 'MISSING!'), null;

-- 나머지 인덱스는 그대로 있어야 한다 (실수로 같이 날리지 않았는지)
insert into s1_result
select 'A13 posts 잔여 인덱스 유지', 'true', (
  select (count(*) = 4)::text from pg_indexes
  where schemaname='public' and tablename='posts'
    and indexname in ('posts_pkey','posts_user_idx','posts_location_gix','posts_country_idx'));

update s1_result set ok = (actual = expected);

select step, expected, actual,
       case when ok then 'OK' else '*** FAIL ***' end as verdict
from s1_result order by step;

rollback;
