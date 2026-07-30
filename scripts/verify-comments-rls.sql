-- =============================================================
-- comments RLS + 하드닝 검증 (Phase Q-1)
--
-- 리허설 모드: 이 스크립트는 마이그레이션 DDL을 **인라인으로 직접 실행**한 뒤
-- 시나리오를 돌리고 통째로 rollback한다. 즉 db push 전에 라이브 DB에서
-- "이 마이그레이션을 적용하면 어떻게 되는가"를 실데이터 오염 없이 확인한다.
-- db push 이후 재검증할 때는 아래 [PART A] 블록만 통째로 주석 처리하면
-- 그대로 회귀 테스트가 된다(정책/제약이 이미 적용돼 있으므로).
--
-- 패턴은 verify-friends-rls.sql / verify-likes-rls.sql과 동일 —
-- temp table results + set local role authenticated + request.jwt.claims.
-- supabase db query가 멀티스테이트먼트에서 마지막 statement 결과만 돌려주므로
-- 모든 결과를 results에 모았다가 맨 끝에 한 번에 조회한다.
--
-- 실행: npx supabase db query --linked -f scripts/verify-comments-rls.sql
--
-- 테스트 계정 (실제 DB):
--   A = gp123  8a181708-b4a3-415a-94b9-aa5bbfc31c04
--   B = mini   69657ce1-d685-4a16-9c86-89e71a5e1262
--   C = test   201c4b20-0283-498a-8a3c-d02d0aee84df
-- Z9 = 실제 ISO와 안 겹치는 더미 country_code. 전부 rollback되므로 무영향.
-- =============================================================

begin;

create temp table results (id serial primary key, label text, expected text, actual text);
grant insert, select on results to authenticated;
grant usage, select on sequence results_id_seq to authenticated;

-- =============================================================
-- [PART A] 마이그레이션 DDL — 단계별로 성공 여부를 기록한다.
--   복합 FK 교체는 순서가 중요하다: drop(기존 단일 FK) → unique(id,post_id)
--   → 새 복합 FK. 각 단계가 순서대로 통과하는지 개별 확인.
-- =============================================================

do $$
begin
  execute 'alter table comments add constraint comments_body_len
             check (char_length(btrim(body)) between 1 and 500)';
  insert into results (label, expected, actual)
  values ('D1. body 길이 CHECK 추가', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D1. body 길이 CHECK 추가', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

do $$
begin
  execute 'alter table comments drop constraint comments_parent_comment_id_fkey';
  insert into results (label, expected, actual)
  values ('D2. 기존 단일 parent FK drop', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D2. 기존 단일 parent FK drop', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

do $$
begin
  execute 'alter table comments add constraint comments_id_post_uniq unique (id, post_id)';
  insert into results (label, expected, actual)
  values ('D3. unique(id, post_id) 추가', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D3. unique(id, post_id) 추가', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

do $$
begin
  execute 'alter table comments add constraint comments_parent_same_post
             foreign key (parent_comment_id, post_id)
             references comments (id, post_id) on delete cascade';
  insert into results (label, expected, actual)
  values ('D4. 복합 FK(parent, post) 추가', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D4. 복합 FK(parent, post) 추가', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

do $$
begin
  execute 'create index comments_post_created_idx on comments (post_id, created_at)';
  execute 'drop index comments_post_idx';
  insert into results (label, expected, actual)
  values ('D5. (post_id, created_at) 인덱스 교체', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D5. (post_id, created_at) 인덱스 교체', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

do $$
begin
  execute 'drop policy comments_update_self on comments';
  insert into results (label, expected, actual)
  values ('D6. UPDATE 정책 제거', '성공', 'PASS - 성공');
exception when others then
  insert into results (label, expected, actual)
  values ('D6. UPDATE 정책 제거', '성공', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

-- 적용 후 남은 정책이 SELECT/INSERT/DELETE 3개인지 확인
insert into results (label, expected, actual)
select 'D7. comments 잔존 정책', 'DELETE,INSERT,SELECT', string_agg(cmd, ',' order by cmd)
  from pg_policies where schemaname = 'public' and tablename = 'comments';

-- =============================================================
-- [PART B] 픽스처
-- =============================================================
update profiles set visibility = 'private' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';
update profiles set visibility = 'public'  where id = '69657ce1-d685-4a16-9c86-89e71a5e1262';
delete from friendships
  where user_low  in ('8a181708-b4a3-415a-94b9-aa5bbfc31c04','69657ce1-d685-4a16-9c86-89e71a5e1262','201c4b20-0283-498a-8a3c-d02d0aee84df')
     or user_high in ('8a181708-b4a3-415a-94b9-aa5bbfc31c04','69657ce1-d685-4a16-9c86-89e71a5e1262','201c4b20-0283-498a-8a3c-d02d0aee84df');

set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into posts (id, user_id, country_code, location, visibility) values
  ('aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04','Z9','POINT(0 0)','private'),
  ('aaaaaaaa-0000-0000-0000-000000000002','8a181708-b4a3-415a-94b9-aa5bbfc31c04','Z9','POINT(0 0)','public');
insert into comments (id, post_id, user_id, body)
values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04','A의 비공개글 댓글');

-- =============================================================
-- [PART C] 기존 가시성 회귀 (1~10)
-- =============================================================
insert into results (label, expected, actual)
select '1. A 자기 비공개글 댓글 SELECT', '1', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, expected, actual)
select '2. B가 A 비공개글 댓글 SELECT', '0', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001','69657ce1-d685-4a16-9c86-89e71a5e1262','침입');
  insert into results (label, expected, actual) values ('3. B가 A 비공개글 INSERT', '차단', 'FAIL - 통과함(구멍!)');
exception when insufficient_privilege then
  insert into results (label, expected, actual) values ('3. B가 A 비공개글 INSERT', '차단', 'PASS - 차단됨');
end $$;

do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000002','69657ce1-d685-4a16-9c86-89e71a5e1262','비친구');
  insert into results (label, expected, actual) values ('4. B가 A(계정private) 공개글 INSERT', '차단', 'FAIL - 통과함(구멍!)');
exception when insufficient_privilege then
  insert into results (label, expected, actual) values ('4. B가 A(계정private) 공개글 INSERT', '차단', 'PASS - 차단됨');
end $$;
reset role;

update profiles set visibility = 'public' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
begin
  insert into comments (id, post_id, user_id, body)
  values ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','69657ce1-d685-4a16-9c86-89e71a5e1262','B의 공개글 댓글');
  insert into results (label, expected, actual) values ('5a. B가 A 공개글 INSERT', '허용', 'PASS - 허용됨');
exception when insufficient_privilege then
  insert into results (label, expected, actual) values ('5a. B가 A 공개글 INSERT', '허용', 'FAIL - 차단됨(문제!)');
end $$;
insert into results (label, expected, actual)
select '5b. B가 A 공개글 댓글 SELECT', '1', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into results (label, expected, actual)
select '5c. B가 A 비공개글 댓글 SELECT', '0', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into comments (id, post_id, user_id, body)
values ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','8a181708-b4a3-415a-94b9-aa5bbfc31c04','A의 공개글 댓글');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
declare affected int;
begin
  delete from comments where id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics affected = row_count;
  insert into results (label, expected, actual) values ('6a. B가 A의 댓글 DELETE', '0', affected::text);
end $$;
do $$
declare affected int;
begin
  delete from comments where id = 'cccccccc-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  insert into results (label, expected, actual) values ('6b. B가 자기 댓글 DELETE', '1', affected::text);
end $$;
do $$
declare affected int;
begin
  update comments set body = '변조됨' where id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics affected = row_count;
  insert into results (label, expected, actual) values ('7. B가 A의 댓글 UPDATE', '0', affected::text);
exception when others then
  insert into results (label, expected, actual) values ('7. B가 A의 댓글 UPDATE', '0', 'ERR ' || SQLSTATE);
end $$;

-- 8. 자기 댓글 post_id를 볼 수 없는 글로 이동 (UPDATE 정책이 사라졌으니 0행이어야 함)
insert into comments (id, post_id, user_id, body)
values ('cccccccc-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000002','69657ce1-d685-4a16-9c86-89e71a5e1262','정상 위치');
do $$
declare affected int;
begin
  update comments set post_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    where id = 'cccccccc-0000-0000-0000-000000000004';
  get diagnostics affected = row_count;
  insert into results (label, expected, actual) values ('8. B가 자기댓글 post_id 이동', '0(정책없음)', affected::text);
exception when others then
  insert into results (label, expected, actual) values ('8. B가 자기댓글 post_id 이동', '0(정책없음)', 'ERR ' || SQLSTATE);
end $$;
reset role;

-- 8b. 이동이 정말 없었는지 글 주인(A) 쪽에서 확인 — A의 비공개글에 B 댓글이 생겼는가
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into results (label, expected, actual)
select '8b. A 비공개글에 B 댓글 유입 여부', '0', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and user_id = '69657ce1-d685-4a16-9c86-89e71a5e1262';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
delete from comments where id = 'cccccccc-0000-0000-0000-000000000004';
reset role;

-- 10. 친구공개 글 — 친구(C) 허용 / 비친구(B) 차단
update posts set visibility = 'friends' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into friendships (user_low, user_high, status, requested_by) values (
  least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid,'201c4b20-0283-498a-8a3c-d02d0aee84df'::uuid),
  greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid,'201c4b20-0283-498a-8a3c-d02d0aee84df'::uuid),
  'accepted','8a181708-b4a3-415a-94b9-aa5bbfc31c04');

set local role authenticated;
set local request.jwt.claims = '{"sub":"201c4b20-0283-498a-8a3c-d02d0aee84df","role":"authenticated"}';
do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000002','201c4b20-0283-498a-8a3c-d02d0aee84df','친구 댓글');
  insert into results (label, expected, actual) values ('10a. 친구(C)가 친구공개글 INSERT', '허용', 'PASS - 허용됨');
exception when insufficient_privilege then
  insert into results (label, expected, actual) values ('10a. 친구(C)가 친구공개글 INSERT', '허용', 'FAIL - 차단됨(문제!)');
end $$;
insert into results (label, expected, actual)
select '10b. 친구(C)가 친구공개글 댓글 SELECT', '2', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000002';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000002','69657ce1-d685-4a16-9c86-89e71a5e1262','비친구 댓글');
  insert into results (label, expected, actual) values ('10c. 비친구(B)가 친구공개글 INSERT', '차단', 'FAIL - 통과함(구멍!)');
exception when insufficient_privilege then
  insert into results (label, expected, actual) values ('10c. 비친구(B)가 친구공개글 INSERT', '차단', 'PASS - 차단됨');
end $$;
insert into results (label, expected, actual)
select '10d. 비친구(B)가 친구공개글 댓글 SELECT', '0', count(*)::text
  from comments where post_id = 'aaaaaaaa-0000-0000-0000-000000000002';
reset role;

-- =============================================================
-- [PART D] 신규 하드닝 검증
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';

-- N1. parent NULL(최상위 댓글) INSERT — MATCH SIMPLE 동작 실증
do $$
begin
  insert into comments (id, post_id, user_id, parent_comment_id, body)
  values ('cccccccc-0000-0000-0000-000000000010','aaaaaaaa-0000-0000-0000-000000000001',
          '8a181708-b4a3-415a-94b9-aa5bbfc31c04', null, '최상위 댓글');
  insert into results (label, expected, actual) values ('N1. parent NULL 최상위 댓글 INSERT', '허용', 'PASS - 허용됨');
exception when others then
  insert into results (label, expected, actual) values ('N1. parent NULL 최상위 댓글 INSERT', '허용', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

-- N2. 같은 글의 댓글을 parent로 (정상 대댓글)
do $$
begin
  insert into comments (id, post_id, user_id, parent_comment_id, body)
  values ('cccccccc-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000001',
          '8a181708-b4a3-415a-94b9-aa5bbfc31c04','cccccccc-0000-0000-0000-000000000010','같은 글 대댓글');
  insert into results (label, expected, actual) values ('N2. 같은 글 댓글을 parent로 INSERT', '허용', 'PASS - 허용됨');
exception when others then
  insert into results (label, expected, actual) values ('N2. 같은 글 댓글을 parent로 INSERT', '허용', 'FAIL - ' || SQLSTATE || ' ' || SQLERRM);
end $$;

-- N3. 다른 글의 댓글을 parent로 (수정 전엔 통과하던 구멍)
do $$
begin
  insert into comments (post_id, user_id, parent_comment_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000002','8a181708-b4a3-415a-94b9-aa5bbfc31c04',
          'cccccccc-0000-0000-0000-000000000010','다른 글 댓글을 부모로');
  insert into results (label, expected, actual) values ('N3. 다른 글 댓글을 parent로 INSERT', '차단', 'FAIL - 통과함(구멍!)');
exception when foreign_key_violation then
  insert into results (label, expected, actual) values ('N3. 다른 글 댓글을 parent로 INSERT', '차단', 'PASS - FK로 차단');
when others then
  insert into results (label, expected, actual) values ('N3. 다른 글 댓글을 parent로 INSERT', '차단', 'PASS? - ' || SQLSTATE);
end $$;

-- N4. 부모 댓글 DELETE → 자식 cascade
do $$
declare child_left int;
begin
  delete from comments where id = 'cccccccc-0000-0000-0000-000000000010';
  select count(*) into child_left from comments where id = 'cccccccc-0000-0000-0000-000000000011';
  insert into results (label, expected, actual)
  values ('N4. 부모 DELETE 후 자식 잔존 수', '0(cascade)', child_left::text);
end $$;

-- N5~N8. 본문 경계값
do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04','가');
  insert into results (label, expected, actual) values ('N5. 본문 1자', '허용', 'PASS - 허용됨');
exception when others then
  insert into results (label, expected, actual) values ('N5. 본문 1자', '허용', 'FAIL - ' || SQLSTATE);
end $$;

do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04', repeat('가', 500));
  insert into results (label, expected, actual) values ('N6. 본문 정확히 500자', '허용', 'PASS - 허용됨');
exception when others then
  insert into results (label, expected, actual) values ('N6. 본문 정확히 500자', '허용', 'FAIL - ' || SQLSTATE);
end $$;

do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04', repeat('가', 501));
  insert into results (label, expected, actual) values ('N7. 본문 501자', '차단', 'FAIL - 통과함(구멍!)');
exception when check_violation then
  insert into results (label, expected, actual) values ('N7. 본문 501자', '차단', 'PASS - CHECK로 차단');
end $$;

do $$
begin
  insert into comments (post_id, user_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001','8a181708-b4a3-415a-94b9-aa5bbfc31c04', '   ');
  insert into results (label, expected, actual) values ('N8. 본문 공백만', '차단', 'FAIL - 통과함(구멍!)');
exception when check_violation then
  insert into results (label, expected, actual) values ('N8. 본문 공백만', '차단', 'PASS - CHECK로 차단');
end $$;

-- N9. UPDATE 정책 제거 확인 — 본인 댓글도 수정 불가(0행)
do $$
declare affected int;
begin
  update comments set body = '수정 시도' where id = 'cccccccc-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  insert into results (label, expected, actual) values ('N9. 본인 댓글 UPDATE', '0(정책없음)', affected::text);
exception when others then
  insert into results (label, expected, actual) values ('N9. 본인 댓글 UPDATE', '0(정책없음)', 'ERR ' || SQLSTATE);
end $$;
reset role;

-- =============================================================
select
  label,
  expected,
  actual,
  case when actual like 'PASS%'
         or actual = expected
         or (expected like '0%' and actual = '0')
       then 'OK' else '*** CHECK ***' end as verdict
from results order by id;

rollback;
