-- =============================================================
-- posts.city_id 옵셔널화 (C-2-2a)
--
-- 배경: cities 테이블이 거의 비어 있어 v1에서 도시 선택을 강제할 수 없다.
-- v1은 나라(country_code)+자유 핀(location)만 필수, 도시(city_id)는 옵셔널로
-- 두고 v1.1에서 cities 데이터가 채워진 뒤 다시 활성화한다.
--
-- country_code는 계속 NOT NULL — 나라는 필수 유지, 변경 없음.
-- city_id의 FK(cities 참조)는 유지 — nullable이되 값이 있으면 유효한 참조여야 함.
-- =============================================================

alter table posts alter column city_id drop not null;
