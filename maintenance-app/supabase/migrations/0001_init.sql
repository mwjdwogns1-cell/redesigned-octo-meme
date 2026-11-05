-- 매장 유지보수 앱 Phase 1 스키마 + RLS
-- 전제: Supabase (auth.users, auth.uid(), 역할 anon/authenticated). 표준 Postgres 문법만 사용.
-- 상태값 코드: item.status = draft|submitted|approved|rejected|held
--              urgency = urgent|normal|low, quarter = q1|q2|q3|q4|now

-- ============ 테이블 ============
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id),
  name text not null,
  active boolean not null default true,
  unique (region_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('staff', 'admin')),
  store_id uuid references public.stores(id),
  region_id uuid references public.regions(id),   -- 관리자 담당 지역. null = 전체 관리자
  name text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  check (role <> 'staff' or store_id is not null)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_urgency text not null default 'normal' check (default_urgency in ('urgent', 'normal', 'low')),
  units text[] not null default '{개}',
  required_fields jsonb not null default '[]',
  active boolean not null default true,
  sort int not null default 0
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  year int not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (store_id, year)
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  category_id uuid not null references public.categories(id),
  result text not null check (result in ('ok', 'needs_repair')),
  unique (submission_id, category_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  category_id uuid not null references public.categories(id),
  area text not null,
  location_detail text not null check (length(trim(location_detail)) > 0),
  symptom text not null check (length(trim(symptom)) > 0),
  onset text not null,
  qty numeric,
  unit text,
  qty_unknown boolean not null default false,
  work_when text not null check (work_when in ('anytime', 'night', 'holiday')),
  high_place text not null default 'unknown' check (high_place in ('yes', 'no', 'unknown')),
  extra jsonb not null default '{}',
  needs_survey boolean not null default false,
  urgency text not null check (urgency in ('urgent', 'normal', 'low')),
  quarter text not null check (quarter in ('q1', 'q2', 'q3', 'q4', 'now')),
  estimate_band text check (estimate_band in ('lt50', '50to200', 'gt200')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'held')),
  reject_reason text,
  reject_missing jsonb not null default '[]',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_store_status_idx on public.items (store_id, status);
create index items_submission_idx on public.items (submission_id);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  kind text not null check (kind in ('wide', 'close', 'scale')),
  path text not null,
  created_at timestamptz not null default now()
);
create index item_photos_item_idx on public.item_photos (item_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid,
  store_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============ 헬퍼 함수 (RLS에서 사용, 재귀 방지를 위해 security definer) ============
create function public.me_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create function public.me_store() returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from public.profiles where id = auth.uid() and status = 'active' and role = 'staff'
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'admin')
$$;

create function public.is_global_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active' and role = 'admin' and region_id is null)
$$;

create function public.admin_can_region(p_region uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
                   and (p.region_id is null or p.region_id = p_region))
$$;

create function public.admin_can(p_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_store is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
      and (p.region_id is null or p.region_id = (select s.region_id from public.stores s where s.id = p_store)))
$$;

-- ============ 트리거 ============
create function public.items_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.needs_survey := coalesce(new.qty_unknown, false)
    or exists (select 1 from jsonb_each_text(new.extra) e where e.value = '__unknown__');
  return new;
end $$;
create trigger items_touch_biu before insert or update on public.items
  for each row execute function public.items_touch();

-- ============ RLS ============
alter table public.regions enable row level security;
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.submissions enable row level security;
alter table public.inspections enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.audit_logs enable row level security;

create policy regions_read on public.regions for select to authenticated using (true);

create policy stores_read on public.stores for select to authenticated using (active or public.is_admin());
create policy stores_admin_ins on public.stores for insert to authenticated with check (public.admin_can_region(region_id));
create policy stores_admin_upd on public.stores for update to authenticated
  using (public.admin_can_region(region_id)) with check (public.admin_can_region(region_id));

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.admin_can(store_id));

create policy categories_read on public.categories for select to authenticated using (active or public.is_admin());
create policy categories_admin_ins on public.categories for insert to authenticated with check (public.is_global_admin());
create policy categories_admin_upd on public.categories for update to authenticated
  using (public.is_global_admin()) with check (public.is_global_admin());

create policy submissions_read on public.submissions for select to authenticated
  using (store_id = public.me_store() or public.admin_can(store_id));

create policy inspections_read on public.inspections for select to authenticated
  using (store_id = public.me_store() or public.admin_can(store_id));
create policy inspections_staff_ins on public.inspections for insert to authenticated
  with check (store_id = public.me_store()
    and exists (select 1 from public.submissions s
                where s.id = submission_id and s.store_id = public.me_store() and s.status = 'draft'));
create policy inspections_staff_upd on public.inspections for update to authenticated
  using (store_id = public.me_store()
    and exists (select 1 from public.submissions s where s.id = submission_id and s.status = 'draft'))
  with check (store_id = public.me_store());

create policy items_read on public.items for select to authenticated
  using (store_id = public.me_store() or public.admin_can(store_id));
create policy items_staff_ins on public.items for insert to authenticated
  with check (store_id = public.me_store()
    and exists (select 1 from public.submissions s
                where s.id = submission_id and s.store_id = public.me_store() and s.status = 'draft'));
create policy items_staff_upd on public.items for update to authenticated
  using (store_id = public.me_store() and status in ('draft', 'rejected'))
  with check (store_id = public.me_store());
create policy items_staff_del on public.items for delete to authenticated
  using (store_id = public.me_store() and status = 'draft');

create policy photos_read on public.item_photos for select to authenticated
  using (store_id = public.me_store() or public.admin_can(store_id));
create policy photos_staff_ins on public.item_photos for insert to authenticated
  with check (store_id = public.me_store()
    and exists (select 1 from public.items i
                where i.id = item_id and i.store_id = public.me_store() and i.status in ('draft', 'rejected')));
create policy photos_staff_del on public.item_photos for delete to authenticated
  using (store_id = public.me_store()
    and exists (select 1 from public.items i
                where i.id = item_id and i.status in ('draft', 'rejected')));

create policy audit_read on public.audit_logs for select to authenticated
  using (public.admin_can(store_id) or (store_id is null and public.is_global_admin()));

-- ============ 권한(GRANT): 기본 전부 회수 후 필요한 것만 ============
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.regions, public.stores, public.profiles, public.categories,
  public.submissions, public.inspections, public.items, public.item_photos, public.audit_logs to authenticated;
grant insert, update on public.stores, public.categories to authenticated;
grant insert (submission_id, store_id, category_id, result) on public.inspections to authenticated;
grant update (result) on public.inspections to authenticated;
-- 직원이 쓸 수 있는 컬럼만 열어 상태·견적구간·반려사유는 직접 변경 불가
grant insert (id, submission_id, store_id, category_id, area, location_detail, symptom, onset, qty, unit,
              qty_unknown, work_when, high_place, extra, urgency, quarter) on public.items to authenticated;
grant update (area, location_detail, symptom, onset, qty, unit, qty_unknown, work_when, high_place,
              extra, urgency, quarter) on public.items to authenticated;
grant delete on public.items to authenticated;
grant insert (item_id, store_id, kind, path) on public.item_photos to authenticated;
grant delete on public.item_photos to authenticated;

-- ============ RPC ============
create function public.join_store(p_store uuid, p_name text, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if not exists (select 1 from public.stores where id = p_store and active) then
    raise exception 'store_not_found';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'admin_account';
  end if;
  insert into public.profiles (id, role, store_id, name, phone)
  values (auth.uid(), 'staff', p_store, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''))
  on conflict (id) do update
    set store_id = excluded.store_id, name = excluded.name, phone = excluded.phone
    where public.profiles.role = 'staff';
  insert into public.audit_logs (actor, store_id, entity, entity_id, action, detail)
  values (auth.uid(), p_store, 'profile', auth.uid(), 'join_store', jsonb_build_object('name', trim(p_name)));
end $$;

create function public.ensure_submission(p_year int) returns uuid
language plpgsql security definer set search_path = public as $$
declare st uuid := public.me_store(); sid uuid;
begin
  if st is null then raise exception 'not_staff'; end if;
  insert into public.submissions (store_id, year) values (st, p_year) on conflict (store_id, year) do nothing;
  select id into sid from public.submissions where store_id = st and year = p_year;
  return sid;
end $$;

create function public.submit_submission(p_submission uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sub public.submissions; errs jsonb := '[]'; cat record; it record; f jsonb; res text; n int;
begin
  select * into sub from public.submissions where id = p_submission and store_id = public.me_store();
  if not found then raise exception 'not_found'; end if;

  if sub.status = 'draft' then
    for cat in select id, name from public.categories where active loop
      select result into res from public.inspections where submission_id = sub.id and category_id = cat.id;
      if res is null then
        errs := errs || jsonb_build_object('category', cat.name, 'msg', '점검 미완료');
      elsif res = 'needs_repair' and not exists (
          select 1 from public.items where submission_id = sub.id and category_id = cat.id) then
        errs := errs || jsonb_build_object('category', cat.name, 'msg', '보수필요인데 등록된 항목이 없음');
      elsif res = 'ok' and exists (
          select 1 from public.items where submission_id = sub.id and category_id = cat.id) then
        errs := errs || jsonb_build_object('category', cat.name, 'msg', '양호인데 등록된 항목이 있음');
      end if;
    end loop;
  end if;

  for it in
    select i.id, i.qty, i.unit, i.qty_unknown, i.extra, c.name as cname, c.required_fields
    from public.items i join public.categories c on c.id = i.category_id
    where i.submission_id = sub.id and i.status in ('draft', 'rejected')
  loop
    select count(*) into n from public.item_photos where item_id = it.id;
    if n < 2 then
      errs := errs || jsonb_build_object('category', it.cname, 'item_id', it.id, 'msg', '사진 2장 이상 필요');
    end if;
    if not it.qty_unknown and (it.qty is null or it.unit is null) then
      errs := errs || jsonb_build_object('category', it.cname, 'item_id', it.id, 'msg', '범위·수량 필요');
    end if;
    for f in select * from jsonb_array_elements(it.required_fields) loop
      if coalesce((f ->> 'required')::boolean, false) and coalesce(it.extra ->> (f ->> 'key'), '') = '' then
        errs := errs || jsonb_build_object('category', it.cname, 'item_id', it.id, 'msg', (f ->> 'label') || ' 필요');
      end if;
    end loop;
  end loop;

  if jsonb_array_length(errs) > 0 then
    return jsonb_build_object('ok', false, 'errors', errs);
  end if;

  update public.items set status = 'submitted', reject_reason = null, reject_missing = '[]'
   where submission_id = sub.id and status in ('draft', 'rejected');
  get diagnostics n = row_count;
  update public.submissions set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
   where id = sub.id;
  insert into public.audit_logs (actor, store_id, entity, entity_id, action, detail)
  values (auth.uid(), sub.store_id, 'submission', sub.id, 'submit', jsonb_build_object('items', n));
  return jsonb_build_object('ok', true, 'count', n);
end $$;

create function public.admin_review_items(
  p_ids uuid[], p_action text, p_reason text default null, p_missing jsonb default '[]', p_band text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare it record; n int := 0; newstatus text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_action not in ('approve', 'reject', 'hold') then raise exception 'bad_action'; end if;
  if p_action = 'reject'
     and coalesce(trim(p_reason), '') = '' and coalesce(jsonb_array_length(p_missing), 0) = 0 then
    raise exception 'reason_required';
  end if;
  newstatus := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'held' end;
  for it in select id, store_id, status from public.items
            where id = any (p_ids) and public.admin_can(store_id)
              and (status = 'submitted' or (status = 'held' and p_action <> 'hold'))
            for update
  loop
    update public.items set
      status = newstatus,
      estimate_band = case when p_action = 'approve' then coalesce(p_band, estimate_band) else estimate_band end,
      reject_reason = case when p_action in ('reject', 'hold') then nullif(trim(coalesce(p_reason, '')), '') else null end,
      reject_missing = case when p_action = 'reject' then coalesce(p_missing, '[]') else '[]' end
    where id = it.id;
    insert into public.audit_logs (actor, store_id, entity, entity_id, action, detail)
    values (auth.uid(), it.store_id, 'item', it.id, p_action,
            jsonb_build_object('from', it.status, 'reason', p_reason, 'missing', p_missing, 'band', p_band));
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.admin_adjust_item(p_id uuid, p_quarter text, p_urgency text) returns void
language plpgsql security definer set search_path = public as $$
declare it public.items;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_quarter not in ('q1', 'q2', 'q3', 'q4', 'now') or p_urgency not in ('urgent', 'normal', 'low') then
    raise exception 'bad_value';
  end if;
  select * into it from public.items where id = p_id and public.admin_can(store_id)
    and status in ('submitted', 'held', 'approved');
  if not found then raise exception 'not_found'; end if;
  update public.items set quarter = p_quarter, urgency = p_urgency where id = p_id;
  insert into public.audit_logs (actor, store_id, entity, entity_id, action, detail)
  values (auth.uid(), it.store_id, 'item', p_id, 'adjust',
          jsonb_build_object('quarter', jsonb_build_array(it.quarter, p_quarter),
                             'urgency', jsonb_build_array(it.urgency, p_urgency)));
end $$;

create function public.admin_set_user_status(p_uid uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.profiles;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'bad_value'; end if;
  select * into pr from public.profiles where id = p_uid and role = 'staff' and public.admin_can(store_id);
  if not found then raise exception 'not_found'; end if;
  update public.profiles set status = p_status where id = p_uid;
  insert into public.audit_logs (actor, store_id, entity, entity_id, action, detail)
  values (auth.uid(), pr.store_id, 'profile', p_uid, 'set_status', jsonb_build_object('status', p_status));
end $$;

-- 함수 실행 권한: 로그인 사용자(익명 로그인 포함)에게만. anon 키만으로는 호출 불가.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.me_role(), public.me_store(), public.is_admin(), public.is_global_admin(),
  public.admin_can(uuid), public.admin_can_region(uuid),
  public.join_store(uuid, text, text), public.ensure_submission(int), public.submit_submission(uuid),
  public.admin_review_items(uuid[], text, text, jsonb, text), public.admin_adjust_item(uuid, text, text),
  public.admin_set_user_status(uuid, text)
to authenticated;
