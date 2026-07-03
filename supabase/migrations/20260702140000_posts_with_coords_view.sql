-- =============================================================
-- posts 좌표 조회용 뷰 posts_with_coords (Phase E)
--
-- 배경: posts.location(geography)을 PostgREST로 그대로 select하면 WKB 16진수
-- 문자열(예: "0101000020E6100000...")로 내려와 프론트에서 파싱할 수 없다.
-- ST_X/ST_Y로 lng/lat 숫자를 미리 뽑아주는 뷰를 만들어, 좌표가 필요한 화면
-- (게시물 상세부터 시작, 나중에 나라상세 핀·프로필 등에서도 재사용 가능)에서
-- posts 대신 이 뷰를 조회하면 된다.
--
-- ⚠️ security_invoker = true 필수 — 없으면 뷰가 뷰 소유자 권한으로 실행돼
-- posts_select_visible RLS가 우회된다(뷰 소유자 기준으로 전체가 보이게 됨).
-- PG15+ 문법 — 이 프로젝트는 PG17(supabase/config.toml)이라 지원됨.
--
-- ⚠️ ST_X = 경도(lng), ST_Y = 위도(lat) 순서 — 반대로 읽지 말 것.
-- =============================================================

create view posts_with_coords
  with (security_invoker = true)
  as
  select
    p.*,
    st_x(p.location::geometry) as lng,
    st_y(p.location::geometry) as lat
  from posts p;

grant select on posts_with_coords to authenticated;
