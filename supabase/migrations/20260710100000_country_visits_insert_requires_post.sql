-- =============================================================
-- country_visits INSERT RLS 구멍 수정 — "색칠은 게시물 있는 나라만"을 DB가 강제
--
-- 배경: G-1(트리거)이 posts INSERT/DELETE에 맞춰 country_visits를 자동 동기화하고,
-- G-2가 앱 UI에서 게시물 없는 나라의 팔레트를 잠갔다. 하지만 country_visits의
-- RLS는 여전히 "본인 행이면 어떤 country_code든 INSERT 가능"이었다 — 즉 앱을
-- 거치지 않고 API를 직접 호출하면 게시물 없는 나라도 칠할 수 있었다. 이 프로젝트의
-- 원칙("권한/데이터 일관성 규칙은 클라이언트가 아니라 DB가 강제")에 어긋나는 구멍.
--
-- 수정: country_visits_owner_all(FOR ALL)을 INSERT/UPDATE/DELETE로 분리하고,
-- INSERT에 "그 나라에 내 게시물이 있어야 함" 조건을 추가한다. SELECT는 기존
-- country_visits_select_visible 정책이 그대로 담당하므로 손대지 않는다.
--
-- UPDATE에도 같은 exists 조건을 WITH CHECK에 추가했다(요청 범위를 넘는 추가 조치) —
-- 색만 바꾸는 정상 UPDATE는 country_code가 그대로라 영향 없지만, 이게 없으면
-- 악의적 클라이언트가 INSERT 대신 "기존 행의 country_code를 게시물 없는 나라로
-- UPDATE"하는 우회로로 이 수정 자체를 무력화할 수 있어 막아둔다.
--
-- ⭐ G-1 트리거(sync_country_visit_on_post_change, SECURITY INVOKER)와의 상호작용
-- 검증 완료(2026-07-10, supabase db query --linked로 트랜잭션을 만들어 실제 테스트 후
-- rollback — 운영 데이터/정책 변경 없음):
--   1. 게시물 없는 나라에 country_visits를 직접 INSERT → 42501(RLS 위반)로 거부됨.
--   2. 게시물 없던 나라(FR)에 실제 posts INSERT → 트리거가 여전히 자동 색칠(#ff6a2b)함.
--      AFTER 트리거는 트리거를 발동시킨 그 post 행이 이미 커밋된 상태에서 실행되므로
--      "그 나라에 내 게시물이 있는가" exists 체크가 트리거가 방금 만든 post 자기 자신을
--      찾아내 항상 참이 된다 — SECURITY INVOKER를 DEFINER로 바꿀 필요 없음(기존 G-1
--      선택 유지).
--   3. 기존 행(KR)의 색 UPDATE → 정상 통과.
-- =============================================================

drop policy if exists country_visits_owner_all on country_visits;

create policy country_visits_insert_own_country on country_visits
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from posts
      where posts.user_id = auth.uid()
        and posts.country_code = country_visits.country_code
    )
  );

create policy country_visits_update_own on country_visits
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from posts
      where posts.user_id = auth.uid()
        and posts.country_code = country_visits.country_code
    )
  );

create policy country_visits_delete_own on country_visits
  for delete to authenticated
  using (user_id = auth.uid());
