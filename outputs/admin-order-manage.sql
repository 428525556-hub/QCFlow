-- QCFlow 管理员总单管理权限
-- 作用：
-- 1. 最高权限账号 shuoyuqc@163.com 可以查看、修改、删除所有订单和订单明细
-- 2. user_profiles.role = 'admin' 的账号也拥有同样权限
-- 3. 普通员工、客户仍然不能进入总单管理修改别人订单

drop policy if exists "admin can read all orders" on public.orders;
drop policy if exists "admin can insert orders" on public.orders;
drop policy if exists "admin can update all orders" on public.orders;
drop policy if exists "admin can delete all orders" on public.orders;

create policy "admin can read all orders"
on public.orders for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can insert orders"
on public.orders for insert
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can update all orders"
on public.orders for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can delete all orders"
on public.orders for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "admin can read all order items" on public.order_items;
drop policy if exists "admin can insert order items" on public.order_items;
drop policy if exists "admin can update all order items" on public.order_items;
drop policy if exists "admin can delete all order items" on public.order_items;

create policy "admin can read all order items"
on public.order_items for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can insert order items"
on public.order_items for insert
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can update all order items"
on public.order_items for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "admin can delete all order items"
on public.order_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);
