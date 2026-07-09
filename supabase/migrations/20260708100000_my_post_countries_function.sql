-- =============================================================
-- my_post_countries() — 내가 기록을 올린 나라 목록 (distinct country_code)
--
-- 배경: 프로필 그리드 나라 필터 칩(D-2)에서 사용.
--
-- ⚠️ security invoker 필수 — posts_with_coords 뷰(Phase E)와 동일 원칙,
-- 함수가 정의자 권한으로 실행되어 posts_select_visible RLS를 우회하지
-- 않도록 한다. auth.uid() 소유 게시물만 집계하므로 다른 사람 게시물은
-- 애초에 섞이지 않지만, invoker 원칙은 일관되게 유지.
--
-- 재사용 예정: "색칠은 게시물 있는 나라만" 규칙(추후 단계)에서도 이 함수를 쓴다.
-- =============================================================

create or replace function my_post_countries()
returns table (country_code char(2))
language sql stable security invoker as $$
  select distinct p.country_code
  from posts p
  where p.user_id = auth.uid()
  order by 1;
$$;

grant execute on function my_post_countries() to authenticated;
