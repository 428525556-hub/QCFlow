# QCFlow Supabase 依赖审计

> 生成时间：2026-08-26　用途：国内正式生产版部署前审计
> 范围：`app/`、`src/`、`lib/`、`components/` 下全部 `.ts/.tsx`（排除 `node_modules`、`.next`、`__tests__`）

## 1. 统计总览

| 类别 | 直接调用次数 | 涉及文件数 | 说明 |
| --- | --- | --- | --- |
| Database（`supabase.from`） | 74 | 19 | 数据读写 |
| Auth（`supabase.auth`） | 11 | 4 | 登录态、用户信息 |
| Storage（`supabase.storage`） | 12 | 4 | 图片/附件上传与公开 URL |
| RPC（`supabase.rpc`） | 8 | 7 | 事务/排程专用函数 |
| Realtime（`supabase.channel`） | 0 | 0 | 未使用 |
| Edge Functions（`supabase.functions`） | 0 | 0 | 未使用 |

## 2. Database 使用位置（19 个文件，74 处）

### 服务端 API 路由（9 个文件）

| 文件 | 次数 | 用途 | 迁移基础 |
| --- | --- | --- | --- |
| `app/api/orders/route.ts` | 1 | 订单列表/创建 | 已具备（页面→Next API→Supabase） |
| `app/api/order-items/route.ts` | 6 | 订单明细 CRUD | 已具备 |
| `app/api/inspections/route.ts` | 6 | 检品记录 | 已具备 |
| `app/api/reinspections/route.ts` | 3 | 复检记录 | 已具备 |
| `app/api/reservation-cartons/route.ts` | 4 | 预约箱号 | 已具备 |
| `app/api/schedule/*`（plan/today/teams/calendar/exceptions/logs/style-factors） | 21 | 自动排程模块 | 已具备 |
| `src/server/supabaseServer.ts` | 1 | 请求级客户端/鉴权 | 已具备（核心封装） |

### 浏览器侧 API 封装（8 个文件）

| 文件 | 次数 | 用途 | 迁移基础 |
| --- | --- | --- | --- |
| `src/api/shipmentApi.ts` | 11 | 出货/装车（含照片） | 页面→Supabase 直连 |
| `src/api/userApi.ts` | 6 | 用户资料/邀请 | 页面→Supabase 直连 |
| `src/api/dispatchApi.ts` | 3 | 出货记录 | 页面→Supabase 直连 |
| `src/api/orderAttachmentsApi.ts` | 2 | 订单附件 | 页面→Supabase 直连 |
| `src/api/ordersApi.ts` | 1 | 订单（混合走 Next API） | 部分 |
| `src/services/scheduleService.ts` | 8 | 排程纯逻辑层（查询部分） | 已具备（逻辑与数据源可分离） |

> ⚠️ **审计结论**：约 23 处（30%）仍为「页面 → 浏览器直连 Supabase」，其余 70% 已走 Next.js API。未来国产化时，直连部分需要全部收敛到 Next.js API 或统一数据层。

## 3. Auth 使用位置

| 文件 | 次数 | 用途 |
| --- | --- | --- |
| `src/api/userApi.ts` | 7 | 获取会话、用户信息、登出 |
| `src/api/excelImportApi.ts` | 2 | 上传时附带登录 Token |
| `src/api/httpClient.ts` | 1 | 请求头注入 Token |
| `src/server/supabaseServer.ts` | 1 | 服务端校验 JWT（`getUser`） |

**当前认证链路**：Supabase Auth（邮箱 + 密码/魔法链接）→ JWT → API 路由用 `requireRequestUser` 校验。

**未来自建认证替换点**：`src/server/supabaseServer.ts` 的 `requireRequestUser/requireRequestProfile/getBearerToken` 是唯一服务端入口；浏览器侧 `userApi.ts` 与 `httpClient.ts` 是唯一客户端入口。**替换难度：低～中**（入口集中）。

## 4. Storage 使用位置（4 个文件，12 处）

| 文件 | 次数 | 操作 | Bucket |
| --- | --- | --- | --- |
| `src/api/storageApi.ts` | 2 | 上传压缩图 + 取公开 URL | `inspection-photos` |
| `src/api/inspectionApi.ts` | 2 | 上传检品照片 + 取公开 URL | `inspection-photos` |
| `src/api/orderAttachmentsApi.ts` | 6 | 上传附件（主/备桶）+ 公开 URL | `order-attachments` / `inspection-photos` |
| `src/api/shipmentApi.ts` | 2 | 上传车辆/箱号照片 + 公开 URL | `inspection-photos` |

**现状**：全部使用 Supabase Storage 的 **Public URL**（`getPublicUrl`），无 signed URL；URL 形如 `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`。

**存在直接暴露 Supabase Storage URL**：是（页面直接渲染 `photo_url`/`file_url`）。

**替换方案**：本仓库将新增 `src/server/storage/` 独立 Adapter（见代码审查部分），业务页面只依赖接口，未来切 COS/OSS 时仅替换 Adapter 实现。

## 5. RPC 使用位置（8 处）

| 文件 | 次数 | 用途 |
| --- | --- | --- |
| `app/api/orders/transaction/route.ts` | 1 | 订单+明细+箱号事务 |
| `app/api/schedule/insert/route.ts` | 1 | 排程插入事务 |
| `app/api/schedule/plan/route.ts` | 1 | 排程计划查询函数 |
| `app/api/schedule/plan/run/route.ts` | 2 | 自动排程执行函数 |
| `app/api/schedule/rollover/route.ts` | 1 | 未完成顺延函数 |
| `app/api/schedule/today/route.ts` | 1 | 今日任务函数 |
| `src/services/excelImportService.ts` | 1 | 批量导入入库函数 |

**迁移难点**：这 8 个 RPC 是 PostgreSQL 函数，迁移到国内 PG 时**函数体可直接复用**（与 Supabase 无关，仅依赖 `auth.uid()` 的需改写）。难度：中。

## 6. Realtime

**未使用**（0 处 `supabase.channel` / `postgres_changes`）。国内部署无需处理 Realtime 依赖。

## 7. 页面层是否直接访问 Supabase

页面组件（`app/*/page.tsx`）**不直接 import supabase**，均通过 `src/api/*` 封装访问。

但 `src/api/*` 中约 8 个模块（shipment/dispatch/user/orderAttachments/inspection/storage/ordersApi 部分）在**浏览器直接调用 Supabase**（含 Storage 上传），这类调用无法在纯服务器部署中代理，是国产化时必须改造的部分。

## 8. 数据库连接方式

- 浏览器侧：`@supabase/supabase-js`（anon key + JWT），走 PostgREST
- 服务端：`src/server/supabaseServer.ts` 创建的请求级客户端（anon key + 用户 JWT），走 PostgREST
- 无直接 PostgreSQL 连接串（`DATABASE_URL` 不存在）——未来自建 PG 需新增

## 9. 环境变量

| 变量 | 类型 | 使用处 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 公开 | 客户端 + 服务端 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公开 | 客户端 + 服务端 |
| `VERCEL_OIDC_TOKEN` | 仅 Vercel | 本地 `.env.local` 残留，部署无用 |

## 10. 未来国产化替换难度总评

| 项 | 难度 | 主要工作 |
| --- | --- | --- |
| Database | 中 | 建立国内 PG；把 74 处 `supabase.from` 收敛到统一数据层；8 个 RPC 函数体迁移 |
| Auth | 低～中 | 替换 `supabaseServer.ts` + `userApi.ts` 两个入口；JWT 自签/自建会话 |
| Storage | 低 | 已集中 4 个文件；按新 Adapter 替换实现 |
| Realtime | 无 | 未使用 |
