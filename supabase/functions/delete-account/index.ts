// 계정 삭제 (P0). DB 삭제는 auth.admin.deleteUser() 한 번으로 전체 FK cascade +
// G-1 트리거(country_visits 정리)까지 자동 처리됨 — 여기서 직접 지우는 테이블 없음.
// Storage(post-media 버킷)는 FK 관계가 없어 별도 정리 필요.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POST_MEDIA_BUCKET = 'post-media'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
async function cleanupStorage(adminClient: any, userId: string) {
  try {
    const prefix = `posts/${userId}`
    const { data: entries, error: listError } = await adminClient.storage
      .from(POST_MEDIA_BUCKET)
      .list(prefix)

    if (listError) {
      console.error('[delete-account] storage list 실패(1단계)', userId, listError)
      return
    }

    const filePaths: string[] = []
    for (const entry of entries ?? []) {
      // Supabase Storage list()는 실제 파일이 아닌 하위 폴더(post_id)를 id:null로 반환함
      // (메타데이터 없는 가상 폴더 엔트리) — 이 경우만 한 단계 더 내려가 파일을 모은다.
      if (entry.id === null) {
        const subPrefix = `${prefix}/${entry.name}`
        const { data: files, error: filesError } = await adminClient.storage
          .from(POST_MEDIA_BUCKET)
          .list(subPrefix)
        if (filesError) {
          console.error('[delete-account] storage list 실패(2단계)', subPrefix, filesError)
          continue
        }
        for (const file of files ?? []) {
          filePaths.push(`${subPrefix}/${file.name}`)
        }
      } else {
        filePaths.push(`${prefix}/${entry.name}`)
      }
    }

    if (filePaths.length === 0) return

    const { error: removeError } = await adminClient.storage
      .from(POST_MEDIA_BUCKET)
      .remove(filePaths)
    if (removeError) {
      console.error('[delete-account] storage remove 실패', userId, removeError)
    }
  } catch (err) {
    // best-effort — Storage 정리가 실패해도 계정 삭제 자체는 계속 진행한다.
    console.error('[delete-account] storage 정리 중 예외', userId, err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: '인증 정보가 없습니다.' }, 401)
  }

  // 사용자 토큰으로 본인 확인 전용 client (anon key + 요청자의 Authorization 헤더).
  // userId는 반드시 이 검증을 거쳐 얻은 값만 사용한다 — body로 받지 않음.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ error: '인증에 실패했습니다.' }, 401)
  }
  const userId = userData.user.id

  // service_role client — Storage 정리 및 계정 삭제 전용 (요청자 신원 확인과는 분리).
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  await cleanupStorage(adminClient, userId)

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error('[delete-account] auth.admin.deleteUser 실패', userId, deleteError)
    return jsonResponse({ error: '계정 삭제에 실패했습니다.' }, 500)
  }

  return jsonResponse({ success: true })
})
