import { supabase } from '@/lib/supabase';

// 좋아요 데이터 계층 (Phase P-1).
//
// 카운트 전략: count-on-read. 좋아요 수는 게시물 상세(한 번에 글 1개)에서만
// 표시하므로 비정규화 컬럼/트리거 없이 매 조회 count 쿼리로 충분하다.
// (그리드엔 개수를 얹지 않기로 확정 — 인스타 그리드와 동일. 나중에 탐색 피드
//  등 리스트에서 개수가 필요해지면 posts.like_count + 카운터 트리거로 승급.)
//
// RLS는 이미 안전(초기 스키마): post_likes SELECT/INSERT가
// exists(select 1 from posts …)로 posts RLS(=can_view_post)에 얹혀가므로
// "볼 수 없는 글의 좋아요는 조회/삽입 불가"가 DB에서 강제된다(라이브 실증 완료).
// DELETE는 user_id=auth.uid()로 내 것만.

export type LikeState = {
  count: number;
  likedByMe: boolean;
};

// 게시물 하나의 좋아요 상태를 읽는다.
//   count     — head:true count:'exact' (행 데이터 없이 개수만, PK 인덱스 히트)
//   likedByMe — (post_id, user_id) PK 점조회
// ⚠️ 조용한 실패 금지: 조회 에러는 throw해서 호출부가 ErrorView로 처리하게 한다.
export async function getLikeState(postId: string, userId: string): Promise<LikeState> {
  const [countRes, mineRes] = await Promise.all([
    supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId),
    supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (countRes.error) {
    console.error('[P-1] 좋아요 수 조회 실패:', countRes.error);
    throw countRes.error;
  }
  if (mineRes.error) {
    console.error('[P-1] 내 좋아요 여부 조회 실패:', mineRes.error);
    throw mineRes.error;
  }

  return {
    count: countRes.count ?? 0,
    likedByMe: !!mineRes.data,
  };
}

// 좋아요 상태를 원하는 값으로 맞춘다(멱등).
//   liked=true  → INSERT. PK 중복(23505)은 "이미 좋아요 상태" = 성공 취급.
//   liked=false → DELETE. 0행은 "이미 안 누른 상태" = 성공(에러 아님).
// 진짜 에러(네트워크/서버)만 throw — 호출부가 낙관값을 서버값으로 원복한다.
export async function setLike(postId: string, userId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });
    // 23505 = unique_violation(복합 PK 중복). 빠른 연타/레이스로 이미 있는 상태 —
    // 원하는 결과와 동일하므로 에러로 보지 않는다.
    if (error && error.code !== '23505') {
      console.error('[P-1] 좋아요 INSERT 실패:', error);
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    // DELETE가 0행이어도 postgrest는 에러를 주지 않는다 — 이미 없는 상태 = 성공.
    if (error) {
      console.error('[P-1] 좋아요 DELETE 실패:', error);
      throw error;
    }
  }
}
