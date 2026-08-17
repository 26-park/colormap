-- Phase S-4 검증: sgg_visits + RLS + 동기화 트리거
--
-- 2용도 (verify-comments-rls.sql / verify-s3-sgg.sql 과 같은 형태):
--   · db push 전 = [PART A] 인라인 DDL + 전체 rollback -> 실데이터 무오염 리허설
--   · db push 후 = [PART A] 블록만 주석 처리하면 회귀 테스트
--
-- ⭐ 이 스크립트의 핵심은 B 섹션이다. Phase N 에서 잡은 누출
--    ("비공개 글만 있는 지역의 방문 사실이 타인에게 샘")이 재발하지 않는지를 본다.
--    시군구는 나라보다 세밀해서 "강남구 다녀갔다"가 새면 영향이 훨씬 크다.
--
-- ⚠️ 계정 공개범위(profiles.visibility)를 현재 DB 상태에 의존하지 않는다.
--    시작할 때 SQL 로 명시적으로 세팅한다(Phase P 에서 확정한 규칙).
--
-- 실행: npx supabase db query --linked -f scripts/verify-s4-sgg-visits.sql

begin;

create temp table r(step text, expect text, got text, ok boolean) on commit drop;
grant insert, select on r to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- [PART A] 마이그레이션 DDL (db push 후 회귀 실행 시 이 블록만 주석 처리)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.sgg_visits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sgg_id     uuid not null references public.sgg(id) on delete cascade,
  color      text not null default '#ff6a2b',
  created_at timestamptz not null default now(),
  constraint sgg_visits_user_sgg_uniq unique (user_id, sgg_id)
);
alter table public.sgg_visits enable row level security;
grant select, insert, update, delete on public.sgg_visits to authenticated;
drop policy if exists sgg_visits_select_visible on public.sgg_visits;
create policy sgg_visits_select_visible on public.sgg_visits
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.posts p
              where p.sgg_id = sgg_visits.sgg_id and p.user_id = sgg_visits.user_id
                and public.can_view_post(p.*, auth.uid()))
);
drop policy if exists sgg_visits_insert_own on public.sgg_visits;
create policy sgg_visits_insert_own on public.sgg_visits
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts
               where posts.user_id = auth.uid() and posts.sgg_id = sgg_visits.sgg_id)
);
drop policy if exists sgg_visits_update_own on public.sgg_visits;
create policy sgg_visits_update_own on public.sgg_visits
for update using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts
               where posts.user_id = auth.uid() and posts.sgg_id = sgg_visits.sgg_id)
);
drop policy if exists sgg_visits_delete_own on public.sgg_visits;
create policy sgg_visits_delete_own on public.sgg_visits
for delete using (user_id = auth.uid());
create or replace function public.sync_sgg_visit_on_post_change()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.sgg_id is not null then
      insert into sgg_visits (user_id, sgg_id, color)
      values (new.user_id, new.sgg_id, '#ff6a2b')
      on conflict (user_id, sgg_id) do nothing;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.sgg_id is distinct from old.sgg_id then
      if new.sgg_id is not null then
        insert into sgg_visits (user_id, sgg_id, color)
        values (new.user_id, new.sgg_id, '#ff6a2b')
        on conflict (user_id, sgg_id) do nothing;
      end if;
      if old.sgg_id is not null and not exists (
        select 1 from posts where user_id = old.user_id and sgg_id = old.sgg_id) then
        delete from sgg_visits where user_id = old.user_id and sgg_id = old.sgg_id;
      end if;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.sgg_id is not null and not exists (
      select 1 from posts where user_id = old.user_id and sgg_id = old.sgg_id) then
      delete from sgg_visits where user_id = old.user_id and sgg_id = old.sgg_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
drop trigger if exists posts_sync_sgg_visit on public.posts;
create trigger posts_sync_sgg_visit
  after insert or update or delete on public.posts
  for each row execute function public.sync_sgg_visit_on_post_change();
-- ═══════════════════════════════════════════════════════ [PART A] 끝 ═══════

-- ── 셋업 ─────────────────────────────────────────────────────────────────────
-- A = gp123(작성자) / B = test(A 의 친구) / C = mini(비친구)
create temp table u on commit drop as
select
  (select id from profiles where username='gp123') as a,
  (select id from profiles where username='test')  as b,
  (select id from profiles where username='mini')  as c;
-- 임시 테이블도 role 전환 후 읽어야 하므로 grant 가 필요하다(r 과 같은 이유).
grant select on u to authenticated;

insert into r
select 'S0 계정 3개 확보', 'true',
       ((a is not null and b is not null and c is not null))::text,
       a is not null and b is not null and c is not null from u;

insert into r
select 'S1 A-B 친구, A-C 비친구', 'true/false',
       are_friends((select a from u),(select b from u))::text||'/'||
       are_friends((select a from u),(select c from u))::text,
       are_friends((select a from u),(select b from u))
       and not are_friends((select a from u),(select c from u));

-- ⚠️ 계정 공개범위를 현재 상태에 의존하지 않고 명시적으로 못박는다.
update profiles set visibility='public' where id in (select a from u union select b from u union select c from u);

-- 대상 시군구 3개. ST_PointOnSurface 로 "반드시 그 안에 있는 점"을 얻는다.
create temp table t on commit drop as
select name,
       id as sgg_id,
       st_pointonsurface(geom::geometry)::geography as pt
  from sgg where name in ('강남구','종로구','서초구') and sgg_code like '11%';
grant select on t to authenticated;

insert into r select 'S2 대상 시군구 3개', '3', count(*)::text, count(*)=3 from t;

-- ═══════════════════════════════════════════════════════════════════════════
-- A. 동기화 트리거 (⭐ authenticated 로 실행 — RLS 와의 상호작용까지 본다)
-- ═══════════════════════════════════════════════════════════════════════════
set local role authenticated;
-- auth.uid() 가 A 를 가리키게 한다. 이후 섹션마다 sub 만 바꿔가며 시점을 전환한다.
do $$
declare aid uuid; begin
  select a into aid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',aid,'role','authenticated')::text, true);
end $$;

-- A1: 글 작성 -> sgg_visits 자동 생성 + 기본색
insert into posts(user_id, location, country_code, visibility, caption)
select a, (select pt from t where name='강남구'), 'KR', 'public', 's4-gangnam-1' from u;

insert into r
select 'A1 글 작성 -> 방문 자동 생성', '1/#ff6a2b',
       coalesce((select count(*)::text||'/'||max(color) from sgg_visits v
                  join t on t.sgg_id=v.sgg_id where t.name='강남구'),'0/-'),
       (select count(*)=1 and max(color)='#ff6a2b' from sgg_visits v
         join t on t.sgg_id=v.sgg_id where t.name='강남구');

-- A2: 앱이 색만 UPDATE -> 허용
update sgg_visits set color='#123456'
 where sgg_id=(select sgg_id from t where name='강남구') and user_id=(select a from u);
insert into r
select 'A2 색 UPDATE 허용', '#123456',
       coalesce((select color from sgg_visits v join t on t.sgg_id=v.sgg_id
                  where t.name='강남구'),'(없음)'),
       (select color from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')='#123456';

-- A3: 같은 시군구에 글 하나 더 -> 사용자가 고른 색이 보존돼야 한다
insert into posts(user_id, location, country_code, visibility, caption)
select a, (select pt from t where name='강남구'), 'KR', 'public', 's4-gangnam-2' from u;
insert into r
select 'A3 두 번째 글 - 색 보존', '#123456',
       coalesce((select color from sgg_visits v join t on t.sgg_id=v.sgg_id
                  where t.name='강남구'),'(없음)'),
       (select color from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')='#123456';

-- A4: 글 하나 삭제 -> 아직 남아 있어야
delete from posts where caption='s4-gangnam-2';
insert into r
select 'A4 글 1개 남으면 방문 유지', '1',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')=1;

-- A5: 마지막 글 삭제 -> 방문도 사라져야
delete from posts where caption='s4-gangnam-1';
insert into r
select 'A5 마지막 글 삭제 -> 방문 삭제', '0',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')=0;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. ⭐ 가시성 (이 스크립트의 핵심)
-- ═══════════════════════════════════════════════════════════════════════════
-- A 가 3개 시군구에 각각 다른 공개범위로 글을 남긴다.
insert into posts(user_id, location, country_code, visibility, caption)
select a, (select pt from t where name='종로구'), 'KR', 'private', 's4-jongno-priv' from u;
insert into posts(user_id, location, country_code, visibility, caption)
select a, (select pt from t where name='서초구'), 'KR', 'public',  's4-seocho-pub'  from u;
insert into posts(user_id, location, country_code, visibility, caption)
select a, (select pt from t where name='강남구'), 'KR', 'friends', 's4-gangnam-fr'  from u;

insert into r
select 'B0 A 본인은 3개 전부', '3',
       (select count(*)::text from sgg_visits where user_id=(select a from u)),
       (select count(*) from sgg_visits where user_id=(select a from u))=3;

-- 비친구 C 시점
do $$
declare cid uuid; begin
  select c into cid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',cid,'role','authenticated')::text, true);
end $$;

insert into r
select 'B1 ⭐비친구: 비공개만 있는 종로구 -> 0행', '0',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='종로구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='종로구')=0;

insert into r
select 'B2 비친구: 공개글 있는 서초구 -> 1행', '1',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구')=1;

insert into r
select 'B3 비친구: 친구공개 강남구 -> 0행', '0',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')=0;

-- 친구 B 시점
do $$
declare bid uuid; begin
  select b into bid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',bid,'role','authenticated')::text, true);
end $$;

insert into r
select 'B4 친구: 친구공개 강남구 -> 1행', '1',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='강남구')=1;

insert into r
select 'B5 친구: 비공개 종로구 -> 0행', '0',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='종로구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='종로구')=0;

-- A 계정을 private 으로 전환
reset role;
update profiles set visibility='private' where id=(select a from u);
set local role authenticated;

do $$
declare cid uuid; begin
  select c into cid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',cid,'role','authenticated')::text, true);
end $$;
insert into r
select 'B6 A가 비공개계정: 비친구 -> 공개글 서초구도 0행', '0',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구')=0;

do $$
declare bid uuid; begin
  select b into bid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',bid,'role','authenticated')::text, true);
end $$;
insert into r
select 'B7 A가 비공개계정: 친구는 서초구 1행', '1',
       (select count(*)::text from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구'),
       (select count(*) from sgg_visits v join t on t.sgg_id=v.sgg_id where t.name='서초구')=1;

reset role;
update profiles set visibility='public' where id=(select a from u);
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- C. 쓰기 차단
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare cid uuid; begin
  select c into cid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',cid,'role','authenticated')::text, true);
end $$;

-- C1: 글이 없는데 직접 INSERT (API 직접 호출 시나리오)
do $$
begin
  insert into sgg_visits(user_id, sgg_id, color)
  select (select c from u), (select sgg_id from t where name='강남구'), '#000000';
  insert into r values('C1 글 없이 INSERT 차단','차단','통과됨',false);
exception when others then
  insert into r values('C1 글 없이 INSERT 차단','차단','차단됨',true);
end $$;

-- C2: 남의 방문 행 UPDATE -> USING 위반은 예외가 아니라 조용한 0행이다
do $$
declare n int; begin
  update sgg_visits set color='#ff0000' where user_id=(select a from u);
  get diagnostics n = row_count;
  insert into r values('C2 남의 행 UPDATE -> 0행','0', n::text, n=0);
end $$;

-- C3: 본인 행이라도 sgg_id 를 "내 글이 없는 시군구"로 옮기는 건 막혀야 한다.
--     (Phase G-3 에서 country_visits 에 뚫려 있던 우회 경로와 같은 형태.)
--     ⚠️ 글이 있는 시군구로 옮기는 케이스는 검사하지 않는다 — 그런 곳엔
--        트리거가 이미 방문 행을 만들어둬서 (user_id, sgg_id) unique 에 걸리므로
--        RLS 가 아니라 제약으로 막히고, 테스트로서 의미가 없다.
do $$
declare aid uuid; target uuid; begin
  select a into aid from u;
  perform set_config('request.jwt.claims', json_build_object('sub',aid,'role','authenticated')::text, true);
  select id into target from sgg where name='제주시';
  begin
    update sgg_visits set sgg_id=target
     where user_id=aid and sgg_id=(select sgg_id from t where name='종로구');
    insert into r values('C3 글 없는 시군구로 이동 차단','차단','통과됨',false);
  exception when others then
    insert into r values('C3 글 없는 시군구로 이동 차단','차단','차단됨',true);
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- D. 인덱스
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ 현재 posts 가 10행 남짓이라 플래너는 당연히 seq scan 을 고른다.
--    seqscan 을 끄고 "이 술어에 posts_sgg_idx 를 쓸 수 있는가"만 확인한다.
set local enable_seqscan = off;
do $$
declare rec record; acc text := ''; aid uuid; sid uuid;
begin
  select a into aid from u;
  select sgg_id into sid from t where name='서초구';
  for rec in
    execute format(
      'explain select 1 from public.posts p where p.sgg_id = %L and p.user_id = %L',
      sid, aid)
  loop
    acc := acc || rec."QUERY PLAN" || ' ';
  end loop;
  insert into r values('D1 posts_sgg_idx 사용 가능','posts_sgg_idx',
    case when acc like '%posts_sgg_idx%' then 'posts_sgg_idx' else acc end,
    acc like '%posts_sgg_idx%');
end $$;
reset enable_seqscan;

-- ═══════════════════════════════════════════════════════════════════════════
select step, expect, got,
       case when ok then 'OK' else '*** FAIL ***' end as result
from r order by step;

rollback;
