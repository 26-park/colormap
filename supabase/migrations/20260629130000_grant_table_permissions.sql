-- =============================================================
-- 테이블 GRANT — authenticated 역할에 기본 접근 권한 부여
--
-- 배경: 프로젝트 생성 시 "Automatically expose new tables" OFF로
--       인해 모든 테이블에 GRANT가 누락됨. RLS 정책 도달 전에
--       42501(permission denied)로 차단되는 문제.
--
-- 원칙:
--   - GRANT = 테이블 출입증(필요 최소 권한)
--   - RLS   = 세부 규칙(이미 각 마이그레이션에서 설정 완료)
--   - 이 파일은 GRANT/EXECUTE만 추가. RLS는 건드리지 않음.
-- =============================================================

-- ---------- profiles ----------
-- SELECT: 계정 자체는 검색에 노출 (PRD 2.1)
-- INSERT: 온보딩 시 본인 프로필 생성
-- UPDATE: 프로필 수정
-- DELETE 없음: 계정 삭제는 추후 별도 처리
grant select, insert, update on table profiles to authenticated;

-- ---------- friendships (v1.1) ----------
-- DELETE: 친구 취소에 필요
grant select, insert, update, delete on table friendships to authenticated;

-- ---------- cities ----------
-- 읽기 전용 참조 데이터. 쓰기는 service_role(시드/관리자)만.
grant select on table cities to authenticated;

-- ---------- country_visits ----------
-- DELETE: 나라 색칠 해제에 필요
grant select, insert, update, delete on table country_visits to authenticated;

-- ---------- posts ----------
grant select, insert, update, delete on table posts to authenticated;

-- ---------- post_media ----------
grant select, insert, update, delete on table post_media to authenticated;

-- ---------- post_likes (v1.1) ----------
-- UPDATE 없음: 좋아요는 추가(insert)/취소(delete)만
grant select, insert, delete on table post_likes to authenticated;

-- ---------- comments (v1.1) ----------
grant select, insert, update, delete on table comments to authenticated;

-- ---------- are_friends 함수 ----------
-- SECURITY DEFINER 함수도 호출 자체에 EXECUTE 권한 필요.
-- RLS 정책 내부에서 호출되므로 authenticated에 부여.
grant execute on function are_friends(uuid, uuid) to authenticated;
