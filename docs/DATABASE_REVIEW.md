# QCFlow 数据库结构审查

> 审查范围：`supabase/schema.sql` + `supabase/migrations/*` + 相关业务代码
> 审查目标：为国内正式 PostgreSQL 从零建库提供依据；先判断是否影响业务，可安全修复的直接修，影响业务的记录待确认

## 结论速览

| # | 审查项 | 结论 | 处理 |
| --- | --- | --- | --- |
| 1 | orders / order_items 重复数据源 | 正常：订单主表 + 明细表，无重复来源；但 `orders.quantity` 与明细合计无一致性约束 | ⚠️ 记录 |
| 2 | 数量字段不一致 | 明细 `inbound_quantity/submitted_quantity` 可超过 `quantity` | ✅ 已加 CHECK |
| 3 | 检品记录关联订单明细 | 仅关联 `order_id`，未关联 `order_item_id`（明细级靠 color/size 文本匹配） | ⚠️ 记录 |
| 4 | 二次检品覆盖历史 | 复检为**新增记录**（`reinspection_records`），不覆盖原检品记录；但删除原检品会级联删除复检 | ⚠️ 记录 |
| 5 | 装箱数量超过订单 | 无总量约束（跨表，需触发器） | ⚠️ 记录 |
| 6 | 出货数量超过可出货 | 无总量约束（跨表） | ⚠️ 记录 |
| 7 | 同一箱号重复 | `shipment_cartons` 无唯一约束（可重复）；`reservation_cartons` 有 `unique(order_id, carton_no)` | ✅ 已加约束 |
| 8 | 同一订单明细重复 | 无唯一约束（PO+SKU+颜色+尺码可能重复录入） | ⚠️ 记录 |
| 9 | 客户和工厂结构 | 以 `customer_name` / `factory_name` 文本字段存在，无客户/工厂主表 | ⚠️ 记录 |
| 10 | 用户权限 | 依赖 Supabase RLS + `user_profiles.role`；正式库需自建用户表 | ✅ 正式 Schema 已建 `users` 表 |
| 11 | 外键完整性 | 总体完整；`orders.assigned_team_id`、`inspection_schedule.order_item_id` 等 on delete 行为需确认 | ⚠️ 部分记录 |
| 12 | 索引 | 排程模块有索引；业务表缺常用索引（orders.status/po_number、order_items.order_id、inspection_records.order_id 等） | ✅ 已补 |
| 13 | 唯一约束 | 已补 `users.email`、`shipment_cartons(order_id, carton_no)`；其余待确认 | ✅/⚠️ |
| 14 | 数据校验 | 已有基础 CHECK；新增明细数量上限 CHECK | ✅ |
| 15 | 时间字段 | `created_at` 齐全；多数表缺 `updated_at`；`schedule_progress_records.record_date` 默认 current_date 为数据库服务器时区 | ✅ 关键表已补 |
| 16 | 删除行为 | 硬删除为主；`orders` 有软删 `deleted_at` 但其他表无；复检级联删除有数据丢失风险 | ⚠️ 记录 |
| 17 | NULL 数据 | `orders.po_number/sku` 允许 NULL（显示层需兜底）；`shipment_items` 等冗余字段允许空串 | ⚠️ 记录 |
| 18 | 并发操作 | 排程函数已用 `for update` 行锁；普通业务写入无显式锁 | ⚠️ 记录 |

## 已确认并直接修复的问题（已写入正式 Schema）

### A. `order_items` 数量上限（中风险）
原 Schema：`inbound_quantity`、`submitted_quantity` 只要求 `>= 0`，可出现「入库量/送检量 > 订单量」。
修复：新增 CHECK
```sql
check (inbound_quantity <= quantity)
check (submitted_quantity <= quantity)
```
> 影响评估：当前业务不会合法产生超量数据；约束防止脏数据，不影响正常流程。

### B. `shipment_cartons` 同一箱号重复（高风险）
原 Schema：无唯一约束，同一订单可重复登记同一箱号 → 出货数量重复累计。
修复：`unique (order_id, carton_no)`（与 `reservation_cartons` 规则一致）。

### C. `users.email` 唯一（中风险）
正式 Schema 新增 `users` 表（替代 `auth.users`），`email` 唯一约束 + 小写归一化约束：
```sql
email text not null unique check (email = lower(email))
```

### D. 常用索引缺失（性能）
正式 Schema 补充：
```sql
create index on orders (status);
create index on orders (po_number);
create index on order_items (order_id);
create index on inspection_records (order_id, created_at desc);
create index on reinspection_records (order_id);
create index on unboxing_records (order_id, created_at desc);
create index on shipment_cartons (order_id);
create index on schedule_progress_records (task_id, created_at);
```

### E. 排程进度表唯一性（低风险）
`schedule_progress_records` 追加式记录不设唯一约束（保留重复打卡由函数校验）；但正式 Schema 增加 `updated_at` 到核心业务表（orders、order_items、user_profiles、inspection_records），便于审计。

## 需人工确认的问题（暂不修改业务逻辑）

### 1. 订单主表与明细数量一致性（订单金额/总数）
`orders.quantity` 与 `order_items.quantity` 合计可能出现不一致。修复需触发器或应用层强校验，会改变录入行为 → **待确认**。

### 2. 检品记录不关联明细
`inspection_records` 无 `order_item_id` 外键，明细级统计依赖 color/size 文本。增加外键需前端联动改造 → **待确认**。

### 3. 复检级联删除
`reinspection_records.source_record_id` 当前 `on delete cascade`：删除检品记录会连带删除复检记录（历史丢失）。改为 `on delete set null` 更安全，但改变删除语义 → **待确认**。

### 4. 装箱/出货总量校验
装箱、出货是否超过订单可出数量，需要跨表触发器或服务层事务校验。当前由前端/API 控制 → **待确认**。

### 5. 订单重复录入
是否允许同一 PO + SKU + 颜色 + 尺码 重复建单（如分批到货）→ **待确认**，确认后才可加唯一约束。

### 6. 客户/工厂主表化
目前客户、工厂均为订单上的文本字段。建立 `customers` / `factories` 主表影响现有录入流程 → **待确认**（建议第二期）。

### 7. 开箱记录同箱号重复
`unboxing_records` 是否允许同一箱号多次登记（返工重开箱）→ **待确认**。

### 8. 删除行为统一
除 `orders` 外均硬删除。是否需要统一软删除/审计 → **待确认**。

## Supabase 特有依赖（正式 Schema 的改造点）

| 依赖 | 原用法 | 正式 Schema 替代 |
| --- | --- | --- |
| `auth.users(id)` | 全部业务表外键 | 新增 `public.users` 表 |
| `auth.uid()` | RLS + 函数 | `app.current_user_id()`（应用层 GUC 注入） |
| `auth.jwt()->>'email'` | RLS + 函数 | `app.current_user_email()` |
| RLS Policies | 全表启用 | 移除（由 Next.js API 层鉴权） |
| `gen_random_uuid()` | 默认值 | 保留（PG13+ 内置） |

## 正式 Schema 文件

`supabase/production_schema.sql` —— 从零建立的正式数据库结构（不含任何测试数据），包含：
- 全部业务表 + 主键/外键/唯一/检查约束
- 上述 A–E 修复
- `users` 表与 `app` 鉴权辅助函数
- 8 个业务函数（订单事务、排程事务）改造版
- 系统初始化数据：**0 行业务数据**（见下方待确认清单）

## 需人工确认的系统初始化数据

以下配置正式库初始化时**不自动插入**，需管理员上线后人工确认/录入：
1. 默认班组（`inspection_teams`）与产能系数（普通款 1.0 / 复杂款 1.3 / 特殊 1.5 等）
2. 款式分类系数（`style_categories`）
3. 工作日历（`production_calendar`，含 2026 年节假日）
4. 正式管理员账号（当前由 Supabase Auth 创建，正式库 `users` 表在认证迁移时写入）
