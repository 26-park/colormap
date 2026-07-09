import { supabase } from '@/lib/supabase';
import { isExternalUrl } from '@/lib/media';

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

// 게시물 삭제 (Phase E-2). post_media는 posts에 on delete cascade, country_visits는
// G-1 트리거가 자동 정리 — 앱이 직접 할 일은 Storage 파일 경로 확보 + posts 삭제 +
// Storage 파일 삭제 셋뿐이다.
//
// ⚠️ 순서 엄수: post_media를 먼저 조회해 경로를 확보한 뒤 posts를 지운다 —
// 반대로 하면 cascade로 post_media가 먼저 사라져 경로를 잃는다.
export async function deletePost(postId: string): Promise<void> {
  const { data: mediaRows, error: mediaError } = await supabase
    .from('post_media')
    .select('url')
    .eq('post_id', postId);

  if (mediaError) {
    console.error('[E-2] post_media 조회 실패:', mediaError);
    throw mediaError;
  }

  // 시드 데이터의 외부 URL(picsum 등)은 Storage 파일이 아니므로 제외.
  const storagePaths = (mediaRows ?? [])
    .map((row) => row.url)
    .filter((url) => !isExternalUrl(url));

  // posts 삭제 — RLS(posts_owner_all)가 본인 것만 허용. 여기서 cascade(post_media)와
  // 트리거(country_visits, G-1)가 함께 처리된다. 실패하면 파일은 건드리지 않는다.
  const { error: postError } = await supabase.from('posts').delete().eq('id', postId);

  if (postError) {
    console.error('[E-2] posts 삭제 실패:', postError);
    throw postError;
  }

  // Storage 파일 삭제는 best-effort — 게시물은 이미 지워졌으므로 실패해도 사용자
  // 입장에선 삭제 성공. 고아 파일은 // TODO: 주기적 정리 배치(나중).
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from('post-media').remove(storagePaths);
    if (storageError) {
      console.error('[E-2] Storage 파일 삭제 실패(고아 파일 남음):', storageError);
    }
  }
}

async function removeMediaBestEffort(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('post-media').remove(paths);
  if (error) {
    console.error('[C-2-3a] 롤백: 사진 삭제 실패:', error);
  }
}
