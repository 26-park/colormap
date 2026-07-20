-- =============================================================
-- 검증 스크립트 (데이터 전용, DDL 없음) — 반드시 begin ~ rollback 통째로
-- 한 연결/세션에서 실행할 것(나눠서 여러 번 호출하면 set local이 매번 리셋됨).
--
-- ⚠️ supabase db query가 멀티스테이트먼트 스크립트에서 "마지막 statement의
-- 결과만" 돌려주는 것을 확인함(2026-07-20, 리허설 1차 시도) — 그래서 각
-- 시나리오의 select/notice를 전부 temp table `results`에 INSERT하고, 맨
-- 마지막에 그 테이블을 한 번에 select해서 전체 결과를 한 결과셋으로 받는다.
--
-- 용도:
--   (a) 새 RLS 마이그레이션 리허설 시: 마이그레이션 DDL 뒤에 이 스크립트를
--       이어붙여서 한 트랜잭션으로 실행 후 전체 rollback.
--   (b) 실제 적용(db push) 후 재확인 시: 이 스크립트만 단독으로 실행
--       (DDL은 이미 커밋됐으므로 데이터만 만들었다 지우면 됨).
--
-- 이 파일은 20260720100000_friend_kickoff_rls_hardening.sql 검증용으로 작성됐지만,
-- 패턴(temp table + role/jwt.claims 스위칭 + rollback) 자체는 재사용 가능 —
-- 이후 posts/country_visits/friendships RLS를 다시 건드릴 때(좋아요·댓글 등)
-- 이 파일을 복제해서 시나리오만 바꿔 쓸 것. CLAUDE.md "권한/가시성 모델"에도
-- 이 파일 위치가 기록돼 있음.
--
-- 테스트 계정 (실제 DB 확인됨, 2026-07-20):
--   A = gp123  8a181708-b4a3-415a-94b9-aa5bbfc31c04  (기존 posts 5개: JP/KR public)
--   B = mini   69657ce1-d685-4a16-9c86-89e71a5e1262  (posts 없음)
--   C = test   201c4b20-0283-498a-8a3c-d02d0aee84df  (posts 없음, A/B와 비친구 상태 유지용)
-- 시작 시점 friendships 테이블은 비어있음(확인됨). Z1~Z3는 실제 ISO 코드와
-- 안 겹치는 더미 country_code — country_code엔 CHECK/FK 없음(확인됨) — rollback되므로
-- 실데이터 영향 없음.
-- =============================================================

begin;

create temp table results (
  id serial primary key,
  label text,
  actual text
);
-- 이후 시나리오들이 role authenticated로 전환해서 이 temp table에 INSERT하므로
-- 소유자(현재 연결 role)가 authenticated에게 권한을 명시적으로 열어줘야 함.
grant insert, select on results to authenticated;
grant usage, select on sequence results_id_seq to authenticated;

-- ---------- 픽스처: 계정 상태를 시나리오 시작값으로 고정 ----------
update profiles set visibility = 'private' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04'; -- A
update profiles set visibility = 'public'  where id = '69657ce1-d685-4a16-9c86-89e71a5e1262'; -- B
update profiles set visibility = 'public'  where id = '201c4b20-0283-498a-8a3c-d02d0aee84df'; -- C

-- =============================================================
-- 1. 비공개 글만 있는 나라(Z1) — B에게 country_visits 안 보여야 함
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into posts (user_id, country_code, location, visibility)
values ('8a181708-b4a3-415a-94b9-aa5bbfc31c04', 'Z1', 'POINT(0 0)', 'private');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '1. 비공개 글만 있는 나라 → B가 봄(기대: 0)', count(*)::text
  from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z1';
reset role;

-- =============================================================
-- 2. 공개 글 있는 나라(Z2), A 계정도 public일 때 — B에게 보여야 함
-- =============================================================
update profiles set visibility = 'public' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';

set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into posts (user_id, country_code, location, visibility)
values ('8a181708-b4a3-415a-94b9-aa5bbfc31c04', 'Z2', 'POINT(0 0)', 'public');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '2. 공개 글 있는 나라(A도 public) → B가 봄(기대: 1)', count(*)::text
  from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z2';
reset role;

update profiles set visibility = 'private' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';

-- =============================================================
-- 3. 본인 조회 — 비공개 글이 있는 나라(Z1)도 본인에겐 항상 보여야 함
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into results (label, actual)
select '3. 본인 조회, 비공개 글 나라(Z1) → 항상 보임(기대: 1)', count(*)::text
  from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z1';
reset role;

-- =============================================================
-- 6. B가 status='accepted'로 직접 INSERT 시도 → 거부돼야 함(에러)
--    nested BEGIN/EXCEPTION이 실패한 INSERT를 자동으로 흡수(암묵적
--    savepoint)하므로 별도 savepoint 불필요.
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
do $$
begin
  begin
    insert into friendships (user_low, user_high, status, requested_by)
    values (
      least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid),
      greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid),
      'accepted',
      '69657ce1-d685-4a16-9c86-89e71a5e1262'
    );
    insert into results (label, actual) values ('6. accepted 직접 INSERT(기대: 거부)', 'FAIL - 통과해버림(구멍 안 막힘)');
  exception when insufficient_privilege then
    insert into results (label, actual) values ('6. accepted 직접 INSERT(기대: 거부)', 'PASS - 거부됨');
  end;
end $$;
reset role;

-- =============================================================
-- 7. B가 정상적으로 pending 요청 생성(B→A) → 성공해야 함
--    이어서 B가 스스로 accepted로 UPDATE 시도 → 0행이어야 함(USING 위반은
--    예외가 아니라 조용한 0행이라 GET DIAGNOSTICS로 판정)
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into friendships (user_low, user_high, status, requested_by)
values (
  least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid),
  greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid),
  'pending',
  '69657ce1-d685-4a16-9c86-89e71a5e1262'
);

do $$
declare
  n int;
begin
  update friendships set status = 'accepted'
    where user_low = least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid)
      and user_high = greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid);
  get diagnostics n = row_count;
  if n = 0 then
    insert into results (label, actual) values ('7. 요청자(B) 셀프 accept(기대: 0행)', 'PASS - 0행(USING 차단)');
  else
    insert into results (label, actual) values ('7. 요청자(B) 셀프 accept(기대: 0행)', format('FAIL - %s행 업데이트됨', n));
  end if;
end $$;
reset role;

-- 7 확인(안전망): 위 UPDATE는 0행이었으니 아직 pending이어야 함
insert into results (label, actual)
select '7-확인. 여전히 pending인지(기대: pending)', status::text
  from friendships
  where user_low = least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid)
    and user_high = greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid);

-- =============================================================
-- 8. A(요청받은 쪽, non-requester)가 accepted로 UPDATE → 성공해야 함
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
update friendships set status = 'accepted'
  where user_low = least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid)
    and user_high = greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid);
reset role;

insert into results (label, actual)
select '8. A가 accept → 성공했는지(기대: accepted)', status::text
  from friendships
  where user_low = least('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid)
    and user_high = greatest('8a181708-b4a3-415a-94b9-aa5bbfc31c04'::uuid, '69657ce1-d685-4a16-9c86-89e71a5e1262'::uuid);

-- =============================================================
-- 9. are_friends(A,B) = true 확인 + A의 friends 글이 B에게 보이는지(Z3)
-- =============================================================
insert into results (label, actual)
select '9-1. are_friends(A,B) (기대: t)',
  are_friends('8a181708-b4a3-415a-94b9-aa5bbfc31c04', '69657ce1-d685-4a16-9c86-89e71a5e1262')::text;

set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into posts (user_id, country_code, location, visibility)
values ('8a181708-b4a3-415a-94b9-aa5bbfc31c04', 'Z3', 'POINT(0 0)', 'friends');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '9-2. friends 글 나라(Z3) → 친구인 B가 봄(기대: 1)', count(*)::text
  from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z3';
reset role;

-- =============================================================
-- 10. posts 가시성 매트릭스 회귀 (본인 A / 친구 B / 비친구 C)
-- =============================================================
insert into results (label, actual)
select '10-owner. A 프로필 상태(기대: private)', visibility::text from profiles
  where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';

set local role authenticated;
set local request.jwt.claims = '{"sub":"8a181708-b4a3-415a-94b9-aa5bbfc31c04","role":"authenticated"}';
insert into results (label, actual)
select '10-A-self. Z1/Z2/Z3 전부 보임(기대: 3)', count(*)::text
  from posts where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code in ('Z1','Z2','Z3');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';
insert into results (label, actual)
select '10-B-friend Z1(private, 기대:0)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z1';
insert into results (label, actual)
select '10-B-friend Z2(public, A private이지만 친구라 보임, 기대:1)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z2';
insert into results (label, actual)
select '10-B-friend Z3(friends, 기대:1)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z3';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"201c4b20-0283-498a-8a3c-d02d0aee84df","role":"authenticated"}';
insert into results (label, actual)
select '10-C-nonfriend Z1(private, 기대:0)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z1';
insert into results (label, actual)
select '10-C-nonfriend Z2(public, A private→못 봄, 기대:0)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z2';
insert into results (label, actual)
select '10-C-nonfriend Z3(friends, 기대:0)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z3';
reset role;

update profiles set visibility = 'public' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';
set local role authenticated;
set local request.jwt.claims = '{"sub":"201c4b20-0283-498a-8a3c-d02d0aee84df","role":"authenticated"}';
insert into results (label, actual)
select '10-C-nonfriend Z2(public, A public로 전환 → 이제 봄, 기대:1)', count(*)::text from posts
  where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04' and country_code = 'Z2';
reset role;
update profiles set visibility = 'private' where id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04';

-- =============================================================
-- 11. explain analyze — country_visits 조회가 posts_country_idx 타는지
--     행이 적으면 플래너가 그냥 seq scan을 고를 수 있음(그 자체는 실패
--     아님) — 판정 기준은 "인덱스 경로가 존재하는가"이므로 enable_seqscan을
--     꺼서 강제로 인덱스 경로만 남긴 플랜도 같이 확인한다. EXPLAIN 결과를
--     동적 EXECUTE로 캡처해 results에 줄 단위로 적재한다.
-- =============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"69657ce1-d685-4a16-9c86-89e71a5e1262","role":"authenticated"}';

do $$
declare
  line text;
begin
  for line in
    execute $q$explain analyze select * from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04'$q$
  loop
    insert into results (label, actual) values ('11-plan(default)', line);
  end loop;
end $$;

set local enable_seqscan = off;

do $$
declare
  line text;
begin
  for line in
    execute $q$explain analyze select * from country_visits where user_id = '8a181708-b4a3-415a-94b9-aa5bbfc31c04'$q$
  loop
    insert into results (label, actual) values ('11-plan(no-seqscan)', line);
  end loop;
end $$;

reset role;

-- =============================================================
-- 최종 출력 — CLI가 마지막 statement 결과만 보여주므로 여기서 한 번에
-- =============================================================
select id, label, actual from results order by id;

rollback;
