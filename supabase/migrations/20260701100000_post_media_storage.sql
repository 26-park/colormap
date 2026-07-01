-- =============================================================
-- post-media Storage 버킷 + RLS 정책 (C-2-1a: 인프라만)
--
-- 설계 문서: docs/PRD.md 9.5 "Storage 보안 설계"
--
-- 원칙 (조회 보안 = B 방식):
--   Storage 정책은 "인증 유저"까지만 열어준다. 실제 가시성(public/friends/private)
--   판정은 posts 테이블 RLS(posts_select_visible)가 담당한다. 사진 URL을 얻으려면
--   먼저 post_media/posts를 select할 수 있어야 하는데, 그 posts 행이 RLS에 막히면
--   URL 자체를 얻지 못하므로 Storage 단에서 가시성 로직을 중복 구현하지 않는다.
--
-- 경로 규칙: posts/{user_id}/{post_id}/{파일명}
--   storage.foldername(name) → ['posts', user_id, post_id]
--   즉 (storage.foldername(name))[2] 가 user_id (⚠️ [1]은 'posts' 고정 세그먼트).
-- =============================================================

-- ---------- 버킷 ----------
-- private (public = false) — URL 유출만으로는 접근 불가, 조회는 signed URL(1시간 만료, C-2-1c)로.
-- file_size_limit / allowed_mime_types 는 C-2-1b에서 업로드 정책(최대 장수/용량/압축) 확정 후 별도 마이그레이션으로 설정.
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

-- ---------- storage.objects 정책 (bucket_id = 'post-media' 로 항상 한정) ----------

-- INSERT(업로드): 본인 폴더에만
create policy post_media_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- SELECT(조회): 인증 유저까지만 — 세부 가시성은 posts RLS가 게이트키핑(위 설계 참고)
create policy post_media_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'post-media');

-- UPDATE: 본인 폴더만
create policy post_media_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'post-media' and (storage.foldername(name))[2] = auth.uid()::text);

-- DELETE: 본인 폴더만
create policy post_media_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[2] = auth.uid()::text);
