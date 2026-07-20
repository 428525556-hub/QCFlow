alter table public.registration_invites
  add column if not exists role text not null default 'staff',
  add column if not exists customer_name text;

alter table public.registration_invites
  drop constraint if exists registration_invites_role_check;

alter table public.registration_invites
  add constraint registration_invites_role_check check (role in ('staff', 'client'));

alter table public.registration_invites
  add column if not exists used_by_email text,
  add column if not exists used_by_user_id uuid references auth.users(id) on delete set null;

alter table public.registration_invites enable row level security;

drop policy if exists "admin can read invites and visitors can validate active invites" on public.registration_invites;
create policy "admin can read invites and visitors can validate active invites"
on public.registration_invites for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or (active = true and used_at is null and expires_at > now())
);

drop policy if exists "admin can insert invites" on public.registration_invites;
create policy "admin can insert invites"
on public.registration_invites for insert
with check ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

drop policy if exists "admin can update invites and visitors can consume invites" on public.registration_invites;
create policy "admin can update invites and visitors can consume invites"
on public.registration_invites for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or (active = true and used_at is null and expires_at > now())
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or used_at is not null
);
