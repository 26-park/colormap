-- =============================================================
-- post_likes RLS 검증 (Phase P-1) — 데이터 전용, DDL 없음. begin ~ rollback 통째로.
--
-- 목적: post_likes의 현행 RLS가 posts RLS(=can_view_post)를 실제로 타는지,
-- 즉 "볼 수 없는 글의 좋아요는 조회/삽입 불가, 볼 수 있는 글은 허용, 내 것만
-- 삭제"를 라이브 DB에서 강제 검증한다. Phase P는 RLS 마이그레이션이 없으므로
-- 이 스크립트는 회귀 방지용 박제 — posts/friendships RLS를 다시 건드릴 때
-- 함께 재실행할 것.
--
-- 패턴은 verify-friends-rls.sql과 동일(temp table results + role/jwt.claims
-- 스위칭 + rollback). supabase db query가 멀티스테이트먼트에서 마지막 statement
-- 결과만 돌려주므로 모든 결과를 results 테이블에 모았다가 맨 끝에 한 번에 조회.
-- 실행: npx supabase db query --linked -f scripts/verify-likes-rls.sql
--
-- 테스트 계정 (실제 DB, 2026-07-20 확인):
--   A = gp123  8a181708-b4a3-415a-94b9-aa5bbfc31c04
--   B = mini   69657ce1-d685-4a16-9c86-89e71a5e1262
-- 시작 시 friendships 비어있음. Z9는 실제 ISO와 안 겹치는 더미 country_code
-- (country_code엔 CHECK/FK 없음). 전부 rollback되므로 실데이터 무영향.
-- =============================================================

begin;

create temp table results (id serial primary key, label text, actual text);
grant insert, select on results to authenticated;
grant usage, select on sequence results_id_seq to authenticated;

-- 픽스처: A=private, B=public, friendships 비움(비친구 상태로 시작)
update profiles set visibility = 'private' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';
update profiles set visibility = 'public'  where id = '69657ce1-d685-4a16-9c86-89e71a5e1262';
delete from friendships
  where user_low  in ('8a181708-b4a3-415a-94b9-aa5bbfc31c04','69657ce1-d685-4a16-9c86-89e71a5e1262')
     or user_high in ('8a181708-b4a3-415a-94b9-aa5bbfc31c04','69657ce1-d685-4a16-9c86-89e71a5e1262');

-- A가 비공개 글(P1) 생성 + 자기 글에 좋아요
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into posts (id, user_id, country_code, location, visibility)
values ('aaaaaaaa-0000-0000-0000-000000000001', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 'Z9', 'POINT(0 0)', 'private');
insert into post_likes (post_id, user_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', '8a181708-b4a3-415a-94b9-aa5bbfc31c04');

-- =============================================================
-- 1. A가 자기 비공개 글 좋아요 SELECT (기대: 1)
-- =============================================================
insert into results (label, actual)
select '1. A 자기 비공개글 좋아요 SELECT(기대:1)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

-- =============================================================
-- 2. B(비친구)가 A 비공개 글 좋아요 SELECT (기대: 0 = posts RLS로 차단)
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '2. B가 A 비공개글 좋아요 SELECT(기대:0)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- =============================================================
-- 3. B(비친구)가 A 비공개 글에 좋아요 INSERT (기대: 차단)
-- =============================================================
do $$
begin
  begin
    insert into post_likes (post_id, user_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '69657ce1-d685-4a16-9c86-89e71a5e1262');
    insert into results (label, actual) values ('3. B가 A 비공개글 INSERT(기대:차단)', 'FAIL - 통과해버림(구멍!)');
  exception when insufficient_privilege then
    insert into results (label, actual) values ('3. B가 A 비공개글 INSERT(기대:차단)', 'PASS - 차단됨');
  end;
end $$;
reset role;

-- =============================================================
-- 4. A 계정+글을 public으로 → B가 좋아요 SELECT/INSERT 가능 (기대: 1 / 허용)
-- =============================================================
update profiles set visibility = 'public' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';
update posts set visibility = 'public' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '4a. B가 A 공개글 좋아요 SELECT(기대:1)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  begin
    insert into post_likes (post_id, user_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '69657ce1-d685-4a16-9c86-89e71a5e1262');
    insert into results (label, actual) values ('4b. B가 A 공개글 INSERT(기대:허용)', 'PASS - 허용됨');
  exception when insufficient_privilege then
    insert into results (label, actual) values ('4b. B가 A 공개글 INSERT(기대:허용)', 'FAIL - 차단됨(문제!)');
  end;
end $$;
reset role;

-- B가 방금 넣은 좋아요 정리(다음 시나리오 깨끗하게)
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
delete from post_likes
  where post_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and user_id = '69657ce1-d685-4a16-9c86-89e71a5e1262';
reset role;

-- =============================================================
-- 5. DELETE는 내 좋아요만 — B가 A의 좋아요를 지우려 하면 0행(못 지움)
--    (A는 여전히 자기 글에 좋아요가 있음. B의 DELETE는 RLS로 0행 처리.)
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
declare affected int;
begin
  delete from post_likes
    where post_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';  -- A의 좋아요를 B가 지우려 시도
  get diagnostics affected = row_count;
  insert into results (label, actual)
  values ('5. B가 A의 좋아요 DELETE(기대:0행)', affected::text);
end $$;
reset role;
-- A의 좋아요가 여전히 남아있는지 확인(기대: 1)
insert into results (label, actual)
select '5b. A 좋아요 여전히 있음(기대:1)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- =============================================================
-- 6. 친구공개 글 — 친구는 좋아요 가능, 비친구는 차단
--    A의 글을 friends로 바꾸고, A와 C(=test)를 친구로, B는 비친구로 둔다.
--      C = test  201c4b20-0283-498a-8a3c-d02d0aee84df (A와 친구 맺음)
-- =============================================================
update posts set visibility = 'friends' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- A-C 친구관계 수립(accepted). RLS 우회를 위해 현재 소유자 role로 직접 insert.
insert into friendships (user_low, user_high, status, requested_by)
values (
  least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '201c4b20-0283-498a-8a3c-d02d0aee84df'::uuid),
  greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '201c4b20-0283-498a-8a3c-d02d0aee84df'::uuid),
  'accepted',
  '8a181708-b4a3-415a-94b9-aa5bbfc31c04'
);

-- 6a. C(친구)가 A 친구공개 글에 좋아요 INSERT (기대: 허용)
set local role authenticated;
set local request.jwt.claims = '{"sub":"201c4b20-0283-498a-8a3c-d02d0aee84df","role":"authenticated"}';
do $$
begin
  begin
    insert into post_likes (post_id, user_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '201c4b20-0283-498a-8a3c-d02d0aee84df');
    insert into results (label, actual) values ('6a. 친구(C)가 친구공개글 INSERT(기대:허용)', 'PASS - 허용됨');
  exception when insufficient_privilege then
    insert into results (label, actual) values ('6a. 친구(C)가 친구공개글 INSERT(기대:허용)', 'FAIL - 차단됨(문제!)');
  end;
end $$;
-- 6b. C(친구)가 좋아요 SELECT (기대: 2 = A + C)
insert into results (label, actual)
select '6b. 친구(C)가 친구공개글 좋아요 SELECT(기대:2)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

-- 6c. B(비친구)가 A 친구공개 글에 좋아요 INSERT (기대: 차단)
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
begin
  begin
    insert into post_likes (post_id, user_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '69657ce1-d685-4a16-9c86-89e71a5e1262');
    insert into results (label, actual) values ('6c. 비친구(B)가 친구공개글 INSERT(기대:차단)', 'FAIL - 통과해버림(구멍!)');
  exception when insufficient_privilege then
    insert into results (label, actual) values ('6c. 비친구(B)가 친구공개글 INSERT(기대:차단)', 'PASS - 차단됨');
  end;
end $$;
-- 6d. B(비친구)가 좋아요 SELECT (기대: 0 = 글 자체가 안 보임)
insert into results (label, actual)
select '6d. 비친구(B)가 친구공개글 좋아요 SELECT(기대:0)', count(*)::text
  from post_likes where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

-- =============================================================
-- 결과 한 번에 출력
-- =============================================================
select label, actual from results order by id;

rollback;
