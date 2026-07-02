import { supabase } from '@/lib/supabase';

export type PostVisibility = 'public' | 'friends' | 'private';

export type SavePostParams = {
  postId: string;
  userId: string;
  countryCode: string;
  lng: number;
  lat: number;
  caption: string | null;
  visibility: PostVisibility;
  placeLabel: string | null;
  // 업로드가 끝난 저장 경로들(order_index = 배열 순서). signed URL이 아니라 저장
  // 경로를 넣는다 — 조회 시 lib/media.ts의 resolveMediaUrls가 signed URL로 교환한다.
  mediaPaths: string[];
};

// posts → post_media 순서로 insert한다. v1은 완벽한 원자성(RPC 트랜잭션) 없이
// best-effort로만 정리한다: 뒷 단계가 실패하면 앞 단계에서 만든 행/파일을 지우려
// 시도한 뒤 원래 에러를 던진다. 호출자는 실패 시 사용자에게 재시도를 안내한다.
export async function savePost(params: SavePostParams): Promise<void> {
  const { postId, userId, countryCode, lng, lat, caption, visibility, placeLabel, mediaPaths } = params;

  const { error: postError } = await supabase.from('posts').insert({
    id: postId,
    user_id: userId,
    country_code: countryCode,
    location: `POINT(${lng} ${lat})`,
    caption,
    visibility,
    place_label: placeLabel,
  });

  if (postError) {
    console.error('[C-2-3a] posts insert 실패:', postError);
    await removeMediaBestEffort(mediaPaths);
    throw postError;
  }

  const mediaRows = mediaPaths.map((path, index) => ({
    post_id: postId,
    url: path,
    order_index: index,
  }));

  const { error: mediaError } = await supabase.from('post_media').insert(mediaRows);

  if (mediaError) {
    console.error('[C-2-3a] post_media insert 실패:', mediaError);
    const { error: rollbackError } = await supabase.from('posts').delete().eq('id', postId);
    if (rollbackError) {
      console.error('[C-2-3a] 롤백: posts 삭제 실패:', rollbackError);
    }
    await removeMediaBestEffort(mediaPaths);
    throw mediaError;
  }
}

async function removeMediaBestEffort(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('post-media').remove(paths);
  if (error) {
    console.error('[C-2-3a] 롤백: 사진 삭제 실패:', error);
  }
}
