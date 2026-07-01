-- =============================================================
-- 테스트 데이터 전용 시드 — 운영 마이그레이션(supabase/migrations)과 무관.
-- supabase db push 시 실행되지 않음. 수동 실행만:
--   npx supabase db query --linked -f scripts/seed-test-data.sql
--   또는 Supabase 대시보드 SQL Editor에 붙여넣어 실행
-- 여러 번 실행해도 안전(고정 id + ON CONFLICT DO NOTHING).
-- =============================================================

begin;

-- ---------- cities ----------
insert into cities (id, name, country_code, admin_region, centroid) values
  (1835848, '서울', 'KR', null, ST_SetSRID(ST_MakePoint(126.9780, 37.5665), 4326)::geography),
  (1850147, '도쿄', 'JP', null, ST_SetSRID(ST_MakePoint(139.6503, 35.6762), 4326)::geography)
on conflict (id) do nothing;

-- ---------- posts ----------
-- user_id: 8a181708-b4a3-415a-94b9-aa5bbfc31c04 (테스트 계정)
insert into posts (id, user_id, city_id, country_code, location, caption, visibility, taken_at) values
  ('11111111-1111-4111-8111-111111111101', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 1835848, 'KR', ST_SetSRID(ST_MakePoint(126.9770, 37.5796), 4326)::geography, '경복궁 나들이', 'public', now() - interval '10 days'),
  ('11111111-1111-4111-8111-111111111102', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 1835848, 'KR', ST_SetSRID(ST_MakePoint(126.9834, 37.5636), 4326)::geography, '명동 거리', 'public', now() - interval '7 days'),
  ('11111111-1111-4111-8111-111111111103', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 1835848, 'KR', ST_SetSRID(ST_MakePoint(126.9327, 37.5285), 4326)::geography, '한강 야경', 'public', now() - interval '3 days'),
  ('22222222-2222-4222-8222-222222222201', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 1850147, 'JP', ST_SetSRID(ST_MakePoint(139.7005, 35.6595), 4326)::geography, '시부야 스크램블', 'public', now() - interval '5 days'),
  ('22222222-2222-4222-8222-222222222202', '8a181708-b4a3-415a-94b9-aa5bbfc31c04', 1850147, 'JP', ST_SetSRID(ST_MakePoint(139.7967, 35.7148), 4326)::geography, '아사쿠사 센소지', 'public', now() - interval '2 days')
on conflict (id) do nothing;

-- ---------- post_media ----------
insert into post_media (id, post_id, url, width, height, order_index) values
  ('a1111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111101', 'https://picsum.photos/seed/seoul-gyeongbok-1/600', 600, 600, 0),
  ('a1111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111102', 'https://picsum.photos/seed/seoul-myeongdong-1/600', 600, 600, 0),
  ('a1111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111102', 'https://picsum.photos/seed/seoul-myeongdong-2/600', 600, 600, 1),
  ('a1111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111103', 'https://picsum.photos/seed/seoul-hangang-1/600', 600, 600, 0),
  ('a2222222-2222-4222-8222-222222222201', '22222222-2222-4222-8222-222222222201', 'https://picsum.photos/seed/tokyo-shibuya-1/600', 600, 600, 0),
  ('a2222222-2222-4222-8222-222222222202', '22222222-2222-4222-8222-222222222202', 'https://picsum.photos/seed/tokyo-asakusa-1/600', 600, 600, 0),
  ('a2222222-2222-4222-8222-222222222203', '22222222-2222-4222-8222-222222222202', 'https://picsum.photos/seed/tokyo-asakusa-2/600', 600, 600, 1)
on conflict (id) do nothing;

commit;
