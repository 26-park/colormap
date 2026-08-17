-- Phase S-4: 시군구 방문 테이블(sgg_visits) + RLS + 동기화 트리거
--
-- country_visits(Phase G-1/G-2/N/G-3에서 검증된 형태)를 그대로 옮긴다.
-- 새로 발명하지 않는다 — 그 형태는 롤백 트랜잭션 검증을 이미 여러 번 통과했다.
--
-- ⭐ 이중 구조: 한국 게시물은 country_visits(KR)도 칠하고 sgg_visits도 칠한다.
--    세계지도는 나라 단위 유지가 확정이라 KR 칠이 사라지면 안 된다.
--
-- ⚠️ 프라이버시: Phase N에서 잡은 누출("비공개 글만 있는 지역의 방문 사실이 샘")이
--    재발하면 안 된다. 시군구는 나라보다 훨씬 세밀해서 "강남구 다녀갔다"가 새면
--    영향이 비교할 수 없이 크다. SELECT 정책은 can_view_post 를 경유한다.

-- ── 1. 테이블 ────────────────────────────────────────────────────────────────
create table if not exists public.sgg_visits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- on delete cascade: 행정구역 개편으로 경계가 사라지면 그 방문도 성립하지 않는다.
  -- (posts.sgg_id 는 set null 이다 — 글 자체는 남아야 하므로 의도적으로 다르다.)
  sgg_id     uuid not null references public.sgg(id) on delete cascade,
  color      text not null default '#ff6a2b',
  created_at timestamptz not null default now(),
  constraint sgg_visits_user_sgg_uniq unique (user_id, sgg_id)
);

alter table public.sgg_visits enable row level security;
grant select, insert, update, delete on public.sgg_visits to authenticated;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- country_visits_select_visible 과 동일한 형태.
-- ⭐ 가시성 조건을 직접 다시 쓰지 않고 can_view_post 를 호출한다
--    ("권한/가시성 모델" 섹션의 단일 소스 규칙).
drop policy if exists sgg_visits_select_visible on public.sgg_visits;
create policy sgg_visits_select_visible on public.sgg_visits
for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.posts p
     where p.sgg_id = sgg_visits.sgg_id
       and p.user_id = sgg_visits.user_id
       and public.can_view_post(p.*, auth.uid())
  )
);

-- INSERT/UPDATE 는 "그 시군구에 내 게시물이 있어야" 통과한다.
-- (country_visits_insert_own_country / _update_own 과 같은 형태 — API 직접
--  호출로 글 없는 지역을 칠하거나, UPDATE 로 sgg_id 를 바꿔 우회하는 걸 막는다.)
drop policy if exists sgg_visits_insert_own on public.sgg_visits;
create policy sgg_visits_insert_own on public.sgg_visits
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts
     where posts.user_id = auth.uid()
       and posts.sgg_id = sgg_visits.sgg_id
  )
);

drop policy if exists sgg_visits_update_own on public.sgg_visits;
create policy sgg_visits_update_own on public.sgg_visits
for update using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts
     where posts.user_id = auth.uid()
       and posts.sgg_id = sgg_visits.sgg_id
  )
);

drop policy if exists sgg_visits_delete_own on public.sgg_visits;
create policy sgg_visits_delete_own on public.sgg_visits
for delete using (user_id = auth.uid());

-- ── 3. 동기화 트리거 ─────────────────────────────────────────────────────────
-- ⭐ G-1 원칙 상속: 생성·삭제는 트리거 전담. 앱은 절대 INSERT/DELETE 하지 않고
--    기존 행의 color 만 UPDATE 한다.
-- security invoker: posts_owner_all 이 이미 user_id = auth.uid() 를 강제하므로
--    트리거도 본인 행만 건드리게 된다(G-1 과 같은 판단).
-- ⚠️ sgg_id 가 null 인 게시물(국외)은 건너뛴다.
create or replace function public.sync_sgg_visit_on_post_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.sgg_id is not null then
      insert into sgg_visits (user_id, sgg_id, color)
      values (new.user_id, new.sgg_id, '#ff6a2b')
      on conflict (user_id, sgg_id) do nothing;   -- 이미 있으면 사용자가 고른 색 보존
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.sgg_id is distinct from old.sgg_id then
      if new.sgg_id is not null then
        insert into sgg_visits (user_id, sgg_id, color)
        values (new.user_id, new.sgg_id, '#ff6a2b')
        on conflict (user_id, sgg_id) do nothing;
      end if;
      if old.sgg_id is not null and not exists (
        select 1 from posts where user_id = old.user_id and sgg_id = old.sgg_id
      ) then
        delete from sgg_visits where user_id = old.user_id and sgg_id = old.sgg_id;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- AFTER 행 단위라 같은 문장 안의 이전 삭제는 이미 반영돼 보인다. 벌크 삭제 시
    -- 마지막 행에서만 아래 exists 가 false 가 되어 정확히 한 번 정리된다.
    if old.sgg_id is not null and not exists (
      select 1 from posts where user_id = old.user_id and sgg_id = old.sgg_id
    ) then
      delete from sgg_visits where user_id = old.user_id and sgg_id = old.sgg_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

-- ⚠️ BEFORE 트리거 posts_set_sgg 가 sgg_id 를 계산한 뒤에 읽어야 하므로 AFTER 다.
drop trigger if exists posts_sync_sgg_visit on public.posts;
create trigger posts_sync_sgg_visit
  after insert or update or delete on public.posts
  for each row execute function public.sync_sgg_visit_on_post_change();
