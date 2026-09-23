-- Private photo attachments for briefings, personal instructions and tasks.

create table if not exists public.work_attachments (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid references public.briefings(id) on delete cascade,
  personal_instruction_id uuid references public.personal_instructions(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint work_attachments_one_parent check (
    num_nonnulls(briefing_id, personal_instruction_id, task_id) = 1
  )
);

create index if not exists idx_work_attachments_briefing on public.work_attachments(briefing_id) where briefing_id is not null;
create index if not exists idx_work_attachments_instruction on public.work_attachments(personal_instruction_id) where personal_instruction_id is not null;
create index if not exists idx_work_attachments_task on public.work_attachments(task_id) where task_id is not null;

alter table public.work_attachments enable row level security;
revoke all on table public.work_attachments from anon, authenticated;
grant select, insert, delete on table public.work_attachments to authenticated;

drop policy if exists upt_approved_gate on public.work_attachments;
create policy upt_approved_gate
on public.work_attachments
as restrictive
for all
to authenticated
using (public.upt_is_approved())
with check (public.upt_is_approved());

drop policy if exists work_attachments_read on public.work_attachments;
create policy work_attachments_read
on public.work_attachments
for select
to authenticated
using (
  uploaded_by = auth.uid()
  or public.upt_is_admin()
  or (
    briefing_id is not null
    and exists (
      select 1
      from public.briefings b
      where b.id = work_attachments.briefing_id
        and public.upt_can_access_workplace(b.event_id, b.workplace_id)
    )
  )
  or (
    personal_instruction_id is not null
    and exists (
      select 1
      from public.personal_instructions pi
      where pi.id = work_attachments.personal_instruction_id
        and pi.user_id = auth.uid()
    )
  )
  or (
    task_id is not null
    and exists (
      select 1
      from public.tasks t
      where t.id = work_attachments.task_id
        and (
          exists (
            select 1
            from public.task_assignments ta
            where ta.task_id = t.id
              and ta.user_id = auth.uid()
          )
          or (t.workplace_id is not null and public.upt_is_responsible(t.event_id, t.workplace_id))
        )
    )
  )
);

drop policy if exists work_attachments_insert on public.work_attachments;
create policy work_attachments_insert
on public.work_attachments
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and (
    public.upt_is_admin()
    or (
      briefing_id is not null
      and exists (
        select 1
        from public.briefings b
        where b.id = work_attachments.briefing_id
          and b.workplace_id is not null
          and public.upt_is_responsible(b.event_id, b.workplace_id)
      )
    )
    or (
      task_id is not null
      and exists (
        select 1
        from public.tasks t
        where t.id = work_attachments.task_id
          and t.workplace_id is not null
          and public.upt_is_responsible(t.event_id, t.workplace_id)
      )
    )
  )
);

drop policy if exists work_attachments_delete on public.work_attachments;
create policy work_attachments_delete
on public.work_attachments
for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or public.upt_is_admin()
  or (
    briefing_id is not null
    and exists (
      select 1
      from public.briefings b
      where b.id = work_attachments.briefing_id
        and b.workplace_id is not null
        and public.upt_is_responsible(b.event_id, b.workplace_id)
    )
  )
  or (
    task_id is not null
    and exists (
      select 1
      from public.tasks t
      where t.id = work_attachments.task_id
        and t.workplace_id is not null
        and public.upt_is_responsible(t.event_id, t.workplace_id)
    )
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'work-media',
  'work-media',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists upt_work_media_insert on storage.objects;
create policy upt_work_media_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-media'
  and public.upt_is_approved()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists upt_work_media_read on storage.objects;
create policy upt_work_media_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-media'
  and public.upt_is_approved()
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.upt_is_admin()
    or exists (
      select 1
      from public.work_attachments wa
      where wa.storage_path = objects.name
    )
  )
);

drop policy if exists upt_work_media_delete on storage.objects;
create policy upt_work_media_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'work-media'
  and public.upt_is_approved()
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.upt_is_admin()
  )
);
