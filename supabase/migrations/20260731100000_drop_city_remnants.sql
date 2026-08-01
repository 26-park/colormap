-- =============================================================
-- Phase S-1: city 잔재 정리
--
-- 배경: 초기 스키마의 "전 세계를 도시 단위로" 모델은 87f9b33에서 나라 단위로
-- 교체됐고(city_visits는 그때 drop됨), C-2-2a(e7b5de5)에서 posts.city_id가
-- nullable이 됐다. 이후 앱 코드에서 cities/city_id 참조는 0곳이 됐지만
-- DB에는 껍데기가 남아 있었다. Phase S(한국 시군구 색칠)는 이 옛 모델을
-- 되살리지 않고 새 테이블로 가므로, 남은 잔재를 여기서 걷어낸다.
--
-- 정리 대상 (적용 전 라이브 DB 실사 기준):
--   - posts.city_id       : 전 행 NULL (사용 0건) → drop
--   - posts_city_idx      : city_id 인덱스 → 컬럼과 함께 자동 소멸
--   - posts_city_id_fkey  : cities 참조 FK → 컬럼과 함께 자동 소멸
--   - cities              : 2행(시드 잔재, 앱 참조 0곳) → drop
--   - cities_select_all   : cities 정책 → 테이블과 함께 자동 소멸
--
-- ⚠️ posts_with_coords 뷰가 city_id를 물고 있다(생성 시 p.* 가 컬럼 목록으로
-- 확장돼 저장됨). 컬럼을 먼저 drop하려면 뷰를 내렸다가 다시 만들어야 한다.
-- 재생성 시 security_invoker=true 를 반드시 유지할 것 — 빠지면 뷰가 소유자
-- 권한으로 돌아 posts_select_visible RLS가 통째로 우회된다(20260702140000 참고).
-- =============================================================

-- ---------- 1. 뷰 내리기 (city_id 의존) ----------
drop view if exists posts_with_coords;

-- ---------- 2. posts.city_id 제거 (FK·인덱스 동반 소멸) ----------
alter table posts drop column if exists city_id;

-- ---------- 3. cities 제거 (정책 동반 소멸) ----------
drop table if exists cities;

-- ---------- 4. 뷰 재생성 (city_id 없는 상태로) ----------
-- 정의는 20260702140000_posts_with_coords_view.sql 과 동일 — p.* 가 이제
-- city_id를 포함하지 않는다는 점만 다르다.
create view posts_with_coords
  with (security_invoker = true)
  as
  select
    p.*,
    st_x(p.location::geometry) as lng,
    st_y(p.location::geometry) as lat
  from posts p;

grant select on posts_with_coords to authenticated;
