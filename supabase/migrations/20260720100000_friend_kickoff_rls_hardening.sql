-- =============================================================
-- 친구 기능 킥오프 — 가시성 판정 통합 + friendships RLS 구멍 보강
--
-- 배경: CLAUDE.md "권한/가시성 모델" 섹션의 ⛔ 차단 조건(2026-07-19 발견) —
-- country_visits가 "그 나라에 게시물이 하나라도 있으면" 생성되고 개별 게시물
-- 가시성을 안 봐서, 비공개 게시물만 있는 나라도 계정이 public이면 "방문 사실"이
-- 샌다. 남의 country_visits/지도를 조회하는 화면을 만들기 전 마지막 타이밍이라
-- 여기서 고친다.
--
-- 조사(2026-07-20) 중 friendships RLS에서 추가로 발견한 구멍 2건도 같이 막는다:
--   - INSERT: status 값에 제약이 없어 'accepted'를 직접 넣어 상대 동의 없이
--     "이미 수락된" 관계를 혼자 만들 수 있었음.
--   - UPDATE: 당사자면 누구나 수정 가능이라, 요청자 본인이 자기 pending 요청을
--     스스로 accepted로 바꿀 수 있었음.
--
-- 구성:
--   1. can_view_post(posts, uuid) — posts_select_visible과 문자 그대로 동치인
--      가시성 판정을 함수 하나로 통합(두 곳에 조건을 복붙하면 나중에 어긋날
--      위험 방지). 동치 증명은 커밋 메시지/대화 기록 참고.
--   2. posts_select_visible 재작성 — can_view_post 호출로 교체(로직 동일).
--   3. country_visits_select_visible 재작성 — 본인은 무조건 통과, 남의 행은
--      "그 나라에 뷰어가 볼 수 있는 게시물이 하나라도 있어야" 노출.
--   4. friendships INSERT/UPDATE 정책 보강 + 신원 컬럼(user_low/user_high/
--      requested_by/created_at) 변조 방지 트리거. SELECT/DELETE는 조사 결과
--      정상이라 손대지 않음.
--
-- 인덱스: country_based_coloring.sql의 posts_country_idx(country_code, user_id)가
-- 새 country_visits 정책의 exists 서브쿼리에 그대로 맞아떨어져 신규 인덱스 불필요.
-- =============================================================

-- =============================================================
-- 1. can_view_post(p posts, viewer uuid)
--    posts_select_visible의 기존 조건을 문자 그대로 옮긴 것 — 로직 변경 없음.
--    security invoker인 이유: 내부에서 참조하는 profiles_select_all이
--    이미 "using (true)"라 정의자 권한으로 올릴 필요가 없고(are_friends는
--    자체적으로 security definer라 friendships RLS와 무관하게 동작),
--    이 프로젝트가 G-1/뷰들에서 일관되게 써온 "충분하면 invoker" 원칙을 따름.
-- =============================================================

create or replace function can_view_post(p posts, viewer uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.user_id = viewer
    or (
      p.visibility = 'public'
      and (
        (select visibility from profiles where id = p.user_id) = 'public'
        or are_friends(viewer, p.user_id)
      )
    )
    or (
      p.visibility = 'friends'
      and are_friends(viewer, p.user_id)
    );
$$;

grant execute on function can_view_post(posts, uuid) to authenticated;

-- =============================================================
-- 2. posts_select_visible 재작성 — can_view_post 호출로 교체
--    (posts_owner_all은 별개 정책이라 영향 없음)
-- =============================================================

drop policy if exists posts_select_visible on posts;

create policy posts_select_visible on posts
  for select to authenticated
  using (can_view_post(posts, auth.uid()));

-- =============================================================
-- 3. country_visits_select_visible 재작성
--    본인 행은 무조건 통과(내 지도는 비공개 글이 있는 나라도 색칠돼야 함) —
--    아래 것 대신 위 조건이 먼저 걸리므로 exists는 "남의 행"에서만 평가된다.
--    ⚠️ exists 안의 posts p 조회는 posts 테이블 자체의 posts_select_visible
--    RLS(=can_view_post)도 동시에 걸린다 — 아래 can_view_post(p, auth.uid())와
--    이중 적용이지만 같은 조건이라 결과는 동일하다(의도적으로 명시해둔 것,
--    버그 아님).
-- =============================================================

drop policy if exists country_visits_select_visible on country_visits;

create policy country_visits_select_visible on country_visits
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from posts p
      where p.country_code = country_visits.country_code
        and p.user_id = country_visits.user_id
        and can_view_post(p, auth.uid())
    )
  );

-- =============================================================
-- 4. friendships RLS 보강
-- =============================================================

-- ---------- 4a. INSERT: pending 상태로만 생성 가능 ----------
-- 기존: requested_by=본인 + 당사자여야 함(정상)이지만 status 값엔 제약이 없어
-- 'accepted'를 직접 넣을 수 있었음. status='pending' 조건 추가.
-- (앱이 status를 아예 안 넘기면 컬럼 DEFAULT 'pending'이 WITH CHECK 평가 전에
-- 이미 채워지므로 정상 흐름엔 영향 없음.)

drop policy if exists friendships_insert_party on friendships;

create policy friendships_insert_party on friendships
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and auth.uid() in (user_low, user_high)
    and status = 'pending'
  );

-- ---------- 4b. UPDATE: pending→accepted 전환만, 요청받은 쪽만 ----------
-- 기존: 당사자면 누구나 수정 가능이라 요청자 본인이 자기 요청을 스스로
-- accepted로 바꿀 수 있었음. USING(구 행 기준)에 "요청자가 아닌 당사자 +
-- 현재 pending"을 걸고, WITH CHECK(신 행 기준)에 "결과가 accepted"를 걸어
-- 이 정책으로 가능한 유일한 전환을 pending→accepted 하나로 제한한다.
-- (거절/끊기는 기존처럼 friendships_delete_party의 DELETE로 처리 — 이
-- 정책은 안 건드림.)

drop policy if exists friendships_update_party on friendships;

create policy friendships_update_party on friendships
  for update to authenticated
  using (
    auth.uid() in (user_low, user_high)
    and requested_by <> auth.uid()
    and status = 'pending'
  )
  with check (
    auth.uid() in (user_low, user_high)
    and status = 'accepted'
  );

-- ---------- 4c. 신원 컬럼 변조 방지 트리거 ----------
-- 위 UPDATE 정책은 "무엇으로 바뀌는지"(status)만 보고 "그 행이 원래 어떤
-- 쌍이었는지"(user_low/user_high/requested_by)는 그대로라고 가정한다. 하지만
-- RLS의 USING/WITH CHECK만으로는 "이 값들이 이전 행과 동일해야 한다"는 것을
-- 걸 수 없어서(WITH CHECK는 신규 행만 보고 구 행과 직접 비교하는 선언적 방법이
-- 없음), 이론상 수락 권한이 있는 당사자가 같은 UPDATE 문에서 user_low나
-- user_high를 제3자로 바꿔치기하거나 requested_by를 조작할 여지가 남는다.
-- RLS로 못 거는 불변식이라 트리거로 막는다(G-1과 같은 패턴 — DB가 데이터
-- 무결성을 전담).
create or replace function friendships_prevent_identity_tamper()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.user_low <> old.user_low
     or new.user_high <> old.user_high
     or new.requested_by <> old.requested_by
     or new.created_at <> old.created_at then
    raise exception 'friendships: user_low/user_high/requested_by/created_at는 수정할 수 없습니다 (status만 변경 가능)';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_lock_identity on friendships;

create trigger friendships_lock_identity
  before update on friendships
  for each row
  execute function friendships_prevent_identity_tamper();

-- ---------- 4d. SELECT/DELETE — 조사 결과 정상, 손대지 않음 ----------
-- friendships_select_party: 당사자만 조회(남의 친구 목록 안 샘) — 유지
-- friendships_delete_party: 당사자 아무나 삭제(거절/끊기) — 유지
