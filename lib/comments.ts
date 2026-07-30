import { supabase } from '@/lib/supabase';

// 댓글 데이터 계층 (Phase Q-2).
//
// RLS는 Q-1 하드닝으로 확정됨(scripts/verify-comments-rls.sql로 실증):
//   SELECT/INSERT — exists(select 1 from posts …)로 posts RLS(=can_view_post)에
//                   얹혀가므로 "볼 수 없는 글의 댓글은 조회/작성 불가"가 DB에서 강제된다.
//   DELETE        — user_id = auth.uid()로 내 것만.
//   UPDATE        — 정책 자체가 없다(v1 수정 미지원). ⚠️ 정책이 없으면 에러가 아니라
//                   조용한 0행이므로, 실수로 update()를 부르면 성공한 척 아무 일도 안 난다.
//
// 카운트 전략은 좋아요와 동일한 count-on-read — 댓글 수를 게시물 상세(글 1개)에서만
// 보여주므로 비정규화 컬럼/트리거 없이 매 조회 count 쿼리로 충분하다.

/** DB의 comments_body_len CHECK와 같은 규칙(btrim 기준 1~500자). */
export const COMMENT_MAX_LENGTH = 500;

/**
 * 한 번에 읽어오는 댓글 수 상한.
 * v1은 페이지네이션 없이 전체 로드 — 게시물 상세가 ScrollView라 안에 FlatList를
 * 넣으면 nested VirtualizedList 경고가 나고, 현재 규모(글당 댓글 수십 개 이하)엔
 * 전체 로드가 더 단순하다.
 * ⭐ 승급 조건: 한 글의 댓글이 이 상한에 닿기 시작하면 그때 무한스크롤로 전환할 것.
 */
export const COMMENT_PAGE_LIMIT = 100;

export type Comment = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  // 작성자 정보는 여기서 평평하게 펴서 넘긴다 — 호출부가 임베드 원형(profiles)을
  // 직접 만지지 않게 하기 위한 것. 아래 normalizeAuthor 주석 참고.
  username: string | null;
  avatarUrl: string | null;
};

export type CommentBodyRejectReason = 'empty' | 'too_long';

/**
 * 본문이 규칙에 안 맞을 때 던지는 에러 — "사용자 입력 문제"를 서버/네트워크 에러와
 * 구분하기 위한 타입. 호출부는 이것만 잡아서 "댓글은 500자까지" 같은 안내를 띄우고,
 * 나머지 에러는 기존대로 일반 실패로 처리한다.
 */
export class CommentBodyRejectedError extends Error {
  constructor(public readonly reason: CommentBodyRejectReason) {
    super(reason === 'empty' ? '내용을 입력해주세요.' : `댓글은 ${COMMENT_MAX_LENGTH}자까지 쓸 수 있어요.`);
    this.name = 'CommentBodyRejectedError';
  }
}

/**
 * 앱 쪽 사전 검증 — DB의 comments_body_len과 같은 규칙을 그대로 옮긴 것.
 * DB 제약은 마지막 방어선이고, 정상 경로는 여기서 먼저 막는다(네트워크 왕복 없이
 * 즉시 안내 + 전송 버튼 비활성화에 재사용).
 */
export function validateCommentBody(body: string): CommentBodyRejectReason | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length > COMMENT_MAX_LENGTH) return 'too_long';
  return null;
}

// PostgREST의 many-to-one 임베드는 런타임에 객체 하나로 오지만, supabase-js의 타입
// 추론은 상황에 따라 배열로 잡는다(알려진 이슈). 그래서 원형을 이 파일 안에서만
// 다루고 normalizeAuthor로 한 번에 편다 — 호출부가 profiles?.[0]?.username 같은
// 코드를 쓰게 되면 정규화가 새어나간 것이니 그때는 이 함수를 고칠 것.
type RawAuthor = { username: string | null; avatar_url: string | null };
type RawCommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: RawAuthor | RawAuthor[] | null;
};

function normalizeAuthor(profiles: RawCommentRow['profiles']): Pick<Comment, 'username' | 'avatarUrl'> {
  const author = Array.isArray(profiles) ? profiles[0] : profiles;
  return {
    username: author?.username ?? null,
    avatarUrl: author?.avatar_url ?? null,
  };
}

function toComment(row: RawCommentRow): Comment {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    ...normalizeAuthor(row.profiles),
  };
}

const COMMENT_SELECT = 'id, user_id, body, created_at, profiles!comments_user_id_fkey(username, avatar_url)';

/**
 * 한 게시물의 댓글을 오래된 순으로 읽는다(대화 흐름).
 * 작성자 프로필은 comments.user_id → profiles.id 직접 FK가 있어 **1쿼리 임베드**로
 * 가져온다(친구 기능은 user_low/high 구조라 2차 쿼리가 필요했던 것과 다름).
 * ⚠️ 조용한 실패 금지: 조회 에러는 throw해서 호출부가 ErrorView로 처리하게 한다.
 */
export async function listComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(COMMENT_PAGE_LIMIT);

  if (error) {
    console.error('[Q-2] 댓글 목록 조회 실패:', error);
    throw error;
  }

  return ((data ?? []) as unknown as RawCommentRow[]).map(toComment);
}

/** 댓글 수 — 행 데이터 없이 개수만(count-on-read). 조회 에러는 throw. */
export async function getCommentCount(postId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  if (error) {
    console.error('[Q-2] 댓글 수 조회 실패:', error);
    throw error;
  }
  return count ?? 0;
}

export type CreateCommentParams = {
  /** 클라이언트에서 미리 만든 uuid(Crypto.randomUUID()). 낙관적 항목과 같은 id를
   *  그대로 INSERT하므로 "임시 id → 실제 id" 교체 로직이 필요 없다. */
  id: string;
  postId: string;
  userId: string;
  body: string;
};

/**
 * 댓글 작성. 본문은 앱에서 먼저 검증하고(정상 경로), DB CHECK 위반(23514)도
 * 같은 CommentBodyRejectedError로 변환해 호출부가 한 가지만 잡으면 되게 한다.
 * 그 밖의 에러(RLS/네트워크/서버)는 그대로 throw — 호출부가 낙관적 항목을 걷어낸다.
 */
export async function createComment(params: CreateCommentParams): Promise<Comment> {
  const { id, postId, userId, body } = params;

  const reason = validateCommentBody(body);
  if (reason) throw new CommentBodyRejectedError(reason);

  const { data, error } = await supabase
    .from('comments')
    .insert({ id, post_id: postId, user_id: userId, body: body.trim() })
    .select(COMMENT_SELECT)
    .single();

  if (error) {
    // 23514 = check_violation. 앱 검증을 우회했거나 규칙이 어긋난 경우 —
    // 서버 장애가 아니라 입력 문제이므로 구분해서 올린다.
    if (error.code === '23514') {
      console.warn('[Q-2] 댓글 본문 DB 제약 위반:', error);
      throw new CommentBodyRejectedError(body.trim().length === 0 ? 'empty' : 'too_long');
    }
    console.error('[Q-2] 댓글 작성 실패:', error);
    throw error;
  }

  return toComment(data as unknown as RawCommentRow);
}

/**
 * 내 댓글 삭제. RLS(comments_delete_self)가 본인 것만 허용하는데,
 * **USING 위반은 에러가 아니라 0행으로 조용히 끝난다**(Phase N/O에서 확인).
 * 그래서 영향 행 수를 돌려주고, 호출부가 0행이면 "이미 지워짐/권한 없음"으로
 * 자기교정하게 한다 — 0행을 성공으로 취급하지 말 것.
 */
export async function removeComment(commentId: string): Promise<number> {
  const { data, error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .select('id');

  if (error) {
    console.error('[Q-2] 댓글 삭제 실패:', error);
    throw error;
  }
  return (data ?? []).length;
}
