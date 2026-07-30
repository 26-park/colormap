-- =============================================================
-- Phase Q-1: comments 하드닝
--
-- comments 테이블과 RLS 4종은 초기 스키마(20260629033442)에 이미 있다.
-- 여기서는 라이브 RLS 실증(scripts/verify-comments-rls.sql)에서 드러난 갭만 메운다.
-- 가시성 정책(SELECT/INSERT/DELETE)은 손대지 않는다 — exists(posts …)로
-- posts RLS(=can_view_post)에 얹혀가는 것이 검증으로 확인됐고, 가시성 조건을
-- 새로 쓰지 않으므로 "can_view_post 재사용" 규칙도 발동하지 않는다.
-- =============================================================

-- 1) 본문 길이/공백 제약
--    검증에서 10만자·공백만 INSERT가 전부 통과함을 확인 — 앱 검증과 별개로
--    DB에서 막는다. btrim 기준이라 "   "(공백만)은 길이 0으로 차단된다.
alter table comments
  add constraint comments_body_len
  check (char_length(btrim(body)) between 1 and 500);

-- 2) 대댓글 정합성: parent는 반드시 "같은 글"의 댓글이어야 한다.
--    기존 단일 FK는 post_id를 보지 않아서, 다른 글(심지어 볼 수 없는 글)의
--    댓글을 부모로 지정한 INSERT가 통과했다(검증 시나리오 9 = FAIL).
--    복합 FK로 선언적으로 강제한다. parent_comment_id가 NULL이면 MATCH SIMPLE
--    규칙상 검사를 건너뛰므로 최상위 댓글은 그대로 허용된다.
alter table comments drop constraint comments_parent_comment_id_fkey;

alter table comments
  add constraint comments_id_post_uniq unique (id, post_id);

alter table comments
  add constraint comments_parent_same_post
  foreign key (parent_comment_id, post_id)
  references comments (id, post_id) on delete cascade;

-- 3) 글별 시간순 조회용 인덱스.
--    댓글 목록은 항상 "이 글의 댓글을 created_at 오름차순"으로 읽는다.
--    기존 comments_post_idx(post_id)는 새 인덱스의 prefix로 완전히 대체된다.
create index comments_post_created_idx on comments (post_id, created_at);
drop index comments_post_idx;

-- 4) v1은 댓글 수정을 지원하지 않는다 → UPDATE 정책 제거.
--    남겨두면 created_at 위조로 목록 정렬을 조작할 수 있다(검증 8-4에서 확인:
--    본인 댓글의 created_at UPDATE가 그대로 통과). 수정을 넣게 되면 그때
--    updated_at + identity-lock 트리거(friendships_lock_identity 패턴)와 함께
--    새 정책을 만든다.
drop policy comments_update_self on comments;
