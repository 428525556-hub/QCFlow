drop policy if exists "users can delete own records" on public.inspection_records;

create policy "users can delete own records"
on public.inspection_records for delete
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);
