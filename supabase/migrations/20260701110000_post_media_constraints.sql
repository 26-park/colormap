-- =============================================================
-- post-media 버킷 업로드 제약 (C-2-1b)
--
-- 확정 정책값 (CLAUDE.md / docs/PRD.md 10장):
--   - 게시물당 최대 10장 (클라이언트에서 selectionLimit로 강제)
--   - 업로드 전 리사이즈: 긴 변 1600px, JPEG 품질 0.8
--   - file_size_limit 5MB는 안전망 (리사이즈 후 실제로는 200~500KB 목표)
-- =============================================================

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'post-media';
