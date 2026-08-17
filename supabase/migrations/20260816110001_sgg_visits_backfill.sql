-- Phase S-4 backfill: 기존 게시물의 시군구 방문 행 생성
--
-- ⚠️ 왜 별도 마이그레이션인가: sync_sgg_visit_on_post_change 트리거는 이후의
--    posts 변경에만 반응한다. S-3 에서 posts.sgg_id 를 backfill 한 시점에는
--    이 트리거가 아직 없었으므로, 그때 채워진 기존 게시물들은 방문 행이 없다.
--    (country_visits 는 G-1 시절에 같은 작업을 이미 거쳤다.)
--
-- 멱등하다 — on conflict do nothing 이라 여러 번 돌려도 안전하고, 사용자가
-- 이미 색을 고른 행이 있으면 그 색을 덮어쓰지 않는다.
insert into public.sgg_visits (user_id, sgg_id, color)
select distinct p.user_id, p.sgg_id, '#ff6a2b'
  from public.posts p
 where p.sgg_id is not null
on conflict (user_id, sgg_id) do nothing;
