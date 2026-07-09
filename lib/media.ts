import { supabase } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // PRD 9.5: 1시간

export function isExternalUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

// post_media.url에는 두 종류가 섞여 있다: 시드의 외부 URL(picsum 등) / 실제 업로드의
// private 버킷 저장 경로(posts/{userId}/{postId}/photo-i.jpg). 외부 URL은 그대로
// 통과시키고, 저장 경로만 signed URL로 배치 교환한다(요청 1회).
export async function resolveMediaUrls(values: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const paths: string[] = [];

  for (const value of values) {
    if (isExternalUrl(value)) {
      result[value] = value;
    } else {
      paths.push(value);
    }
  }

  if (paths.length > 0) {
    const { data, error } = await supabase.storage
      .from('post-media')
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error('[media] signed url 발급 실패:', error);
    } else {
      for (const item of data) {
        result[item.path ?? ''] = item.error ? null : item.signedUrl;
      }
    }
  }

  return result;
}
