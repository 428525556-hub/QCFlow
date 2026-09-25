# QCFlow Supabase 依赖地图（Phase 1 审计）

> 日期：2026-08-27　阶段：国内正式生产迁移 Phase 1（仅审计，未修改代码）
> 范围：`app/`、`src/`、`lib/`、`components/` 全部业务代码（排除 node_modules/.next/__tests__）

## 一、总览

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 引用 Supabase 的业务文件 | 47 个 | 其中 27 个 API 路由 + 11 个浏览器侧模块 + 9 个页面/组件间接依赖 |
| `supabase.from`（数据读写） | 77 处 | 服务端 API 路由 + 浏览器直连模块 |
| `supabase.auth`（认证） | 11 处 | 登录/注册/登出/Session/Token |
| `supabase.rpc`（函数调用） | 8 处 | 订单事务 + 排程事务 |
| `supabase.storage`（存储） | 3 处 | 已收敛到存储适配层 |
| `supabase.channel`（Realtime） | 1 处 | 订单页实时刷新 |
| `createClient`（客户端工厂） | 4 处 | 浏览器 client + 服务端 client |
| `createRequestSupabaseClient`（服务端请求级 client） | 57 处 | 27 个 API 路由共用 |

## 二、分类结论（A / B / C / D）

### A. 必须替换（正式运行依赖，共 8 类）

| # | 依赖 | 位置 | 替换方案 |
| --- | --- | --- | --- |
| A1 | 浏览器 Supabase client | `src/lib/supabaseClient.ts`、`src/api/client.ts`、`lib/supabaseClient.ts` | 删除；浏览器只走 Next.js API |
| A2 | 服务端鉴权 `supabaseServer.ts` | `requireRequestUser/Profile/Staff/Admin`、`getBearerToken`、`createRequestSupabaseClient` | 替换为本地会话/JWT 校验（Phase 4 认证） |
| A3 | `supabase.auth`（11 处） | `src/api/userApi.ts`、`httpClient.ts`、`excelImportApi.ts`、`supabaseServer.ts` | 本地认证（登录/登出/Session/邀请码） |
| A4 | `supabase.from`（77 处） | 27 个 API 路由 + `dispatchApi/shipmentApi/orderAttachmentsApi/ordersApi/userApi/scheduleService` | 统一走 `pg` 数据访问层（Phase 3） |
| A5 | `supabase.rpc`（8 处） | orders/transaction、schedule/insert、schedule/plan、plan/run、rollover、today、tasks/[id]、tasks/[id]/progress、excelImportService | 改造成国内 PG 原生函数（production_schema 已就绪）或迁到 service 层 |
| A6 | `supabase.storage`（3 处） | `src/server/storage/supabaseStorage.ts` | 替换为 COS 实现（适配层已隔离） |
| A7 | Realtime（1 处） | `src/api/ordersApi.ts` subscribeOrdersProgress（orders 页实时刷新） | 替换为轮询或停用 |
| A8 | 浏览器直连 Supabase 的 src/api 模块 | dispatchApi、shipmentApi、orderAttachmentsApi、ordersApi、userApi | 全部收敛为 页面→Next.js API→PG |

### B. 可以删除（正式环境不需要）

| 项目 | 位置 | 说明 |
| --- | --- | --- |
| Supabase RLS 策略 | `supabase/schema.sql`、`staff_shared_access.sql` 全部 policy | 正式库由 API 层鉴权 |
| `auth.uid()` / `auth.jwt()` | 8 个函数 + 全部 policy | production_schema 已用 `app.current_user_id()` 替代 |
| Supabase 专有函数 schedule_assert_staff / schedule_current_email | migration SQL | 已改造为 PG 原生版本 |
| `@supabase/supabase-js` 依赖 | package.json | 全部替换完成后删除 |
| `VERCEL_OIDC_TOKEN` | .env.local | 本地遗留 |

### C. 仅开发环境使用

| 项目 | 说明 |
| --- | --- |
| Supabase 测试库中的业务数据 | 正式环境从 0 开始，不迁移 |
| `supabase/cleanup_audit.sql` 等审计脚本 | 仅测试库审计用 |

### D. 可以保留但正式环境不使用

| 项目 | 说明 |
| --- | --- |
| `supabase/schema.sql`、`migrations/*`、`staff_shared_access.sql` | 历史测试库迁移记录，保留存档 |
| `supabase/production_schema.sql` | 正式库初始化基础（无 Supabase Auth 依赖）——保留 |
| `docs/SUPABASE_DEPENDENCY_AUDIT.md`、`docs/CHINA_*`、`docs/CLEANUP_REPORT.md` | 历史文档，保留 |
| Vercel 旧部署 | 不参与国内正式运行，保留不删 |

## 三、客户端工厂（浏览器侧）

| 文件 | 内容 | 分类 |
| --- | --- | --- |
| `src/lib/supabaseClient.ts` | `createClient(url, anonKey)` 浏览器 client | A1 |
| `src/api/client.ts` | 再导出 supabase | A1 |
| `lib/supabaseClient.ts` | 兼容再导出 | A1 |

所有 `src/api/*`（dispatchApi/shipmentApi/orderAttachmentsApi/ordersApi/userApi/excelImportApi/httpClient/inspectionApi/storageApi）都经 `@/src/api/client` 依赖该 client。

## 四、服务端客户端与鉴权

`src/server/supabaseServer.ts` 是全部 27 个 API 路由的鉴权与数据入口：

| 函数 | 用途 | 分类 |
| --- | --- | --- |
| `createRequestSupabaseClient` | 按请求 Token 建 client（57 处调用） | A2 |
| `requireRequestUser` | `supabase.auth.getUser(token)` 校验 | A2/A3 |
| `requireRequestProfile` | 查 user_profiles 决定角色 | A2/A4 |
| `requireStaffProfile` / `requireAdminProfile` | 角色守卫 | A2 |
| `getBearerToken` | 取 Authorization 头 | A2 |

## 五、supabase.auth 使用清单（11 处）

| 文件 | 用法 | 分类 |
| --- | --- | --- |
| `src/api/userApi.ts` | getUser / onAuthStateChange / signOut / signInWithPassword / signUpWithProfile 等 | A3 |
| `src/api/httpClient.ts` | 请求头注入 access_token | A3 |
| `src/api/excelImportApi.ts` | 上传预览时取 token | A3 |
| `src/server/supabaseServer.ts` | getUser(token) 服务端校验 | A3 |

依赖方：`app/login/page.tsx`、`app/admin/invites/page.tsx`、`components/AuthGuard.tsx` 及全部页面。

## 六、supabase.from 使用清单（77 处）

### 服务端 API 路由（约 53 处）

orders、order-items（+[id]）、inspections、reinspections、reservation-cartons、shipment-batches、schedule（teams/[id]、style-factors、calendar、calendar/exceptions、logs、orders/[id]、plan、today）——全部经 `createRequestSupabaseClient`。

### 浏览器直连模块（约 24 处，必须收敛）

| 文件 | 表 | 说明 |
| --- | --- | --- |
| `src/api/shipmentApi.ts` | shipment_cartons/items、unboxing_records、orders | 出货/装箱/开箱 |
| `src/api/dispatchApi.ts` | dispatch_records | 出货记录 |
| `src/api/orderAttachmentsApi.ts` | order_attachments | 附件增删查 |
| `src/api/ordersApi.ts` | orders/order_items + 多表同步更新 | 订单 + 明细身份同步 |
| `src/api/userApi.ts` | user_profiles、registration_invites | 用户资料/邀请码 |
| `src/services/scheduleService.ts` | orders/order_items 等 | 排程查询 |
| `src/services/excelImportService.ts` | findExistingDuplicateKeys（orders） | 导入去重 |

## 七、supabase.rpc 使用清单（8 处）

| 调用点 | 函数 | 分类 |
| --- | --- | --- |
| `app/api/orders/transaction/route.ts` | create_order_with_items | A5 |
| `app/api/schedule/insert/route.ts` | apply_schedule_insert | A5 |
| `app/api/schedule/plan/run/route.ts` | apply_schedule_run | A5 |
| `app/api/schedule/rollover/route.ts` | rollover_schedule | A5 |
| `app/api/schedule/today/route.ts` | 排程今日查询 | A5 |
| `app/api/schedule/tasks/[id]/route.ts` | apply_manual_adjust | A5 |
| `app/api/schedule/tasks/[id]/progress/route.ts` | record_schedule_progress | A5 |
| `src/services/excelImportService.ts` | create_order_with_items（导入写入） | A5 |

对应 8 个 PostgreSQL 函数：`production_schema.sql` 已有全部改造版（app.* GUC 注入用户上下文），可直接用于正式库。

## 八、Storage

`src/server/storage/` 适配层已存在（types / supabaseStorage / index）：

| 能力 | 当前（Supabase） | 正式（COS）要求 |
| --- | --- | --- |
| 上传 | ✓ upload | 需 COS 实现 |
| 获取公开地址 | ✓ getPublicUrl | 需 COS 实现（或临时签名 URL） |
| 删除 | ✗ 缺失 | 需补充 |
| 临时访问地址 | ✗ 缺失 | 私有桶需签名 URL |
| 文件类型/大小限制 | 由调用方控制 | 需在 API 层统一校验 |

业务代码仅依赖 `src/server/storage/index.ts`，替换实现即可，页面/API 无需改动。

## 九、页面/组件间接依赖

`app/login`、`app/admin/invites`、`app/orders/new`、`app/reservations/new`、`app/reinspect/[id]`、`app/ship`、`app/ship/[id]`、`app/unbox`、`components/AuthGuard`、`components/InspectionWorkspace` 等，均通过 `src/api/*` 间接依赖 Supabase Auth/DB。

## 十、27 个 API 路由逐个审计

| 路由 | supabase 使用 | 鉴权 | 迁移动作 |
| --- | --- | --- | --- |
| orders | from | Profile/Staff | PG |
| orders/[id] | from | Profile/Staff | PG |
| orders/bulk | from | Admin | PG |
| orders/transaction | rpc | Staff | PG 函数/事务 |
| orders/import（+preview/template） | rpc/server-client | Staff | PG/导入逻辑 |
| order-items（+[id]） | from | Profile/Staff | PG |
| inspections | from | Profile | PG |
| reinspections | from | Profile/Staff | PG |
| reservation-cartons | from | Staff | PG |
| shipment-batches | from | Staff | PG |
| schedule/teams、style-factors、calendar、logs、orders/[id] | from | Staff/Admin | PG |
| schedule/insert、plan/run、rollover、tasks/[id]、tasks/[id]/progress、today | rpc（+from） | Staff | PG 函数 |
| schedule/plan | rpc+from | Staff | PG 函数 |
| schedule/insert/preview | server-client | Staff | 纯逻辑，无需 DB |

全部路由已服务端鉴权；迁移后保留同一套守卫，仅把数据源从 PostgREST 换成 `pg`。

## 十一、环境变量审计

| 变量 | 当前 | 正式环境处理 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器+服务端 | 删除（不再暴露 Supabase） |
| `DATABASE_URL` | 不存在 | 新增（服务端专用，含 PG 密码） |
| `PG_*`（host/port/user/password/db） | 无 | 新增（服务器环境注入） |
| `COS_*`（secretId/secretKey/bucket/region） | 无 | 新增（服务端专用） |
| `AUTH_SECRET` / `SESSION_SECRET` | 无 | 新增（服务端签名 Session） |
| `ADMIN_EMAIL` | 已有 | 保留为服务端变量 |
| `VERCEL_OIDC_TOKEN` | 本地遗留 | 删除 |

规则：`NEXT_PUBLIC_*` 只放必须暴露给浏览器的值；密码/密钥一律服务端环境变量 + Docker `--env-file` 注入，不入镜像。

## 十二、迁移顺序（对应 Phase 2–11）

1. Phase 2：production_schema.sql 初始化国内 PG
2. Phase 3：建立 src/server/db 数据访问层，替换 A4
3. Phase 4：本地认证（users + Session + 密码哈希），替换 A2/A3
4. Phase 5：API 守卫迁移（保持 27 路由鉴权语义）
5. Phase 6：COS 存储实现，替换 A6（补删除/签名 URL）
6. Phase 7：删除 A1/A7/A8 与 @supabase/supabase-js
7. Phase 8–11：测试 → Docker 构建 → 部署 → 人工验收

## 结论

**必须替换（A）**：浏览器 client、服务端鉴权、auth、from（77）、rpc（8）、storage、realtime、浏览器直连模块 —— 共 8 类。
**可删除（B）**：RLS、Supabase 专有函数、@supabase/supabase-js、VERCEL_OIDC_TOKEN。
**保留存档（D）**：schema/migrations 历史、production_schema.sql、文档、Vercel 旧部署。
**正式业务代码最终不得再出现 supabase（除文档/迁移目录）**。
