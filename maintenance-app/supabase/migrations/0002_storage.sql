-- 사진 저장소 (Supabase Storage). 경로 규칙: {store_id}/{item_id}/{파일명}.jpg
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy "item_photos_read" on storage.objects for select to authenticated
using (bucket_id = 'item-photos' and (
  (storage.foldername(name))[1] = public.me_store()::text
  or public.admin_can(((storage.foldername(name))[1])::uuid)));

create policy "item_photos_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.me_store()::text);

create policy "item_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = public.me_store()::text);
