-- =============================================================
-- "색칠은 게시물 있는 나라만" 규칙을 DB 트리거로 강제 (Phase G-1)
--
-- 배경: country_visits(색칠)와 posts(게시물)가 서로 무관하게 존재할 수 있었음
-- (예: 게시물 없이 CN만 칠해진 상태). 앱 코드가 아니라 DB가 다음을 보장한다
-- — 어떤 경로(정상 흐름/버그/수동 SQL)로 게시물이 생기고 사라져도 색칠 상태는
-- 항상 "게시물이 있는 나라만 칠해져 있다"로 일관된다.
--
-- 확정 규칙:
--   ① posts INSERT 시 country_visits에 행이 없으면 자동 생성(기본색), 있으면 그대로 둠
--      (사용자가 이미 고른 색을 덮어쓰지 않음)
--   ② 그 나라의 posts가 0개가 되면 country_visits 행도 자동 삭제
--   ③ posts.country_code가 바뀌는 경우(현재 앱엔 없지만 대비) 새 나라는 ①과 동일하게
--      생성, 옛 나라는 ②와 동일하게 0개면 정리
--
-- 기본색: 브랜드 주황 '#ff6a2b' (country_visits.color 컬럼 DEFAULT인 '#3B82F6'
-- 대신 명시적으로 이 값을 사용 — 지도 첫인상을 앱 테마색으로).
--
-- SECURITY INVOKER를 쓴 이유 (are_friends()의 SECURITY DEFINER와 의도적으로 다름):
--   - posts RLS(posts_owner_all)가 INSERT/UPDATE/DELETE 시 이미
--     "user_id = auth.uid()"를 강제하므로, 이 트리거가 다루는 NEW.user_id /
--     OLD.user_id는 항상 트리거를 발동시킨 본인(auth.uid())과 같다.
--   - 그래서 country_visits에 대한 insert/delete도 country_visits_owner_all
--     정책(user_id = auth.uid())을 그대로 통과한다 — DEFINER로 권한을 올릴
--     필요가 없다. INVOKER가 "본인 행만 건드릴 수 있다"를 RLS로 자동 보장하는
--     더 안전한 선택.
--   - service_role(관리자/시드 스크립트)로 posts를 조작하는 경우는 RLS 자체를
--     우회하므로 INVOKER/DEFINER 여부와 무관하게 항상 동작한다.
--   - search_path는 그래도 고정한다(스키마 하이재킹 방지 — search_path 앞쪽에
--     낀 악성 스키마가 country_visits/posts를 가로채지 못하도록).
-- =============================================================

create or replace function sync_country_visit_on_post_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into country_visits (user_id, country_code, color)
    values (new.user_id, new.country_code, '#ff6a2b')
    on conflict (user_id, country_code) do nothing;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.country_code is distinct from old.country_code then
      insert into country_visits (user_id, country_code, color)
      values (new.user_id, new.country_code, '#ff6a2b')
      on conflict (user_id, country_code) do nothing;

      if not exists (
        select 1 from posts
        where user_id = old.user_id and country_code = old.country_code
      ) then
        delete from country_visits
        where user_id = old.user_id and country_code = old.country_code;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- 이 트리거는 AFTER 행 단위로 실행되고, 같은 문장 안의 이전 행 삭제는
    -- 커맨드 카운터가 올라가 이미 반영된 상태로 보인다. 벌크 삭제 시
    -- 마지막 남은 행을 지울 때만 아래 exists가 false가 되어 정확히 한 번
    -- country_visits가 정리된다.
    if not exists (
      select 1 from posts
      where user_id = old.user_id and country_code = old.country_code
    ) then
      delete from country_visits
      where user_id = old.user_id and country_code = old.country_code;
    end if;
    return old;
  end if;

  return null;
end;
$$;

create trigger posts_sync_country_visit
  after insert or update or delete on posts
  for each row
  execute function sync_country_visit_on_post_change();

-- =============================================================
-- 기존 데이터 정리 (④): 게시물 없이 칠해진 country_visits 행 제거
--
-- push 전 --linked 쿼리로 확인한 영향 범위: 정확히 1행
--   user_id=8a181708-b4a3-415a-94b9-aa5bbfc31c04, country_code=CN, color=#8b5cf6
-- (CLAUDE.md에 기록된 "CN이 게시물 없이 칠해져 있음" 사례와 일치)
-- =============================================================

delete from country_visits cv
where not exists (
  select 1 from posts p
  where p.user_id = cv.user_id and p.country_code = cv.country_code
);
