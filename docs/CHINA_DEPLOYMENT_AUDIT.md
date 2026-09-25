# QCFlow 国内部署审计

> 只读审计，未修改任何代码 / 数据库 / UI。日期：2026-08-26。

## 1. 当前架构

- Next.js 14 App Router + TypeScript + Tailwind，单体应用（前后端一体），部署于 Vercel。
- 数据层全部使用 Supabase：PostgreSQL（20 张表 + 65 条 RLS 策略）、Auth（邮箱密码 + 邀请码）、Storage（2 个 bucket）、Realtime（1 处订阅）。
- 分层现状：页面 → `src/api`（supabase 客户端 / httpClient）→ Next.js API Route（服务端鉴权）→ Supabase；业务计算在 `src/services`。
- 关键入口：`src/api/*`（客户端访问层）、`src/server/*`（服务端鉴权/响应/日志）、`app/api/**`（约 25 个路由）、`src/services/scheduling`（排程引擎，纯 TS 可单测）。

## 2. Supabase 依赖（统计）

| 调用 | 数量 | 位置 |
| --- | --- | --- |
| `supabase.from` | 89 | 全部在 `app/api/**`（服务端）与 `src/services/excelImportService.ts`；另有 5 处在 `src/api/userApi.ts`（客户端查 user_profiles / registration_invites） |
| `supabase.auth` | 11 | 客户端 `userApi.ts` / `httpClient.ts` / `excelImportApi.ts`；服务端 `src/server/supabaseServer.ts` |
| `supabase.storage` | 12 | 客户端 `storageApi.ts` / `inspectionApi.ts` / `orderAttachmentsApi.ts` / `shipmentApi.ts` |
| `supabase.rpc` | 10 | 服务端：订单事务、排程系列、Excel 导入 |
| `supabase.channel` / `postgres_changes` | 1 | `src/api/ordersApi.ts` 的 `subscribeOrdersProgress` |
| `getPublicUrl` | 6 | 客户端各 storage API |

页面层（`app/**/*.tsx`）没有任何直接 `supabase.from/auth/storage` 调用；组件层只有 `AuthGuard`（auth 状态）与 `InspectionWorkspace`（照片上传）。业务数据链路已是「页面 → API → Supabase」，**已经具备迁移基础**。唯一例外：`userApi.ts` 的 profile / 邀请码查询仍在客户端直连（anon key + RLS），迁移 Auth 时需要改成 API 路由。

## 3. Storage 依赖

- bucket：`inspection-photos`、`order-attachments`（`src/constants/storage.ts`）。
- 上传：客户端直传，路径 `{userId}/...`，RLS 校验 bucket + 路径首段 = `auth.uid()`。
- 读取：全部为 **public URL**（`getPublicUrl` → `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`），无 signed URL。
- `next.config.mjs` 的 `images.remotePatterns` 允许 `**.supabase.co`（next/image 加载存储图片）。
- 涉及文件：`src/api/storageApi.ts`、`inspectionApi.ts`、`orderAttachmentsApi.ts`、`shipmentApi.ts`、`components/PhotoPicker.tsx`、`src/utils/imageUpload.ts`（压缩）。
- 替换难度：**中**。上传/URL 生成集中在 `src/api` 一层，换 OSS/COS 时改这一层 + 图片域名即可。

## 4. Auth 依赖

- 登录：`supabase.auth.signInWithPassword`（邮箱 + 密码）。
- 注册：`signUp` + Supabase 邮箱确认邮件 + 邀请码（`registration_invites` / `code_hash`）。
- Session：supabase-js 客户端本地存储；`httpClient` 取 token；服务端 `requireRequestUser` 用 `auth.getUser(token)` 校验 JWT。
- 权限：`user_profiles` 角色 + 65 条 RLS（依赖 `auth.uid()` / JWT email）。
- 涉及文件：`src/api/userApi.ts`、`components/AuthGuard.tsx`、`src/server/supabaseServer.ts`、`app/login/page.tsx`、`app/admin/invites/page.tsx`。
- 替换难度：**高**。自建认证需同时替换：登录/注册/session、邀请码、服务端 JWT 校验、RLS 里的 `auth.uid()` 逻辑。

## 5. Realtime 依赖

- 唯一订阅：`src/api/ordersApi.ts → subscribeOrdersProgress`（监听 `orders` / `inspection_records` / `reinspections`），用于 `app/orders/page.tsx` 订单列表自动刷新。
- 国内部署**可以先关闭**：把自动刷新改为手动刷新/短轮询，影响低、无业务损失。

## 6. Vercel 依赖

- 环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（`src/config/env.ts` 强校验）。
- 无 Cron / Edge / Region 特殊配置；API 路由默认 Node Runtime；无 `vercel.json`。
- 已有 `Dockerfile`（node:20-alpine，`pnpm start`），可直接用于任意 Node 服务器。
- 结论：Vercel 本身可整体替换为国内服务器，代码无需改；只需换环境变量注入方式。

## 7. 国内部署最小改动方案（方案 A）

架构：国内轻量服务器（腾讯云/阿里云，大陆机房）+ Docker + Nginx/HTTPS + 域名（ICP 备案），Supabase 继续使用。

- 代码改动：约零（仅部署配置与环境变量）。
- 成本：服务器约 100–200 元/年；域名 + 备案免费/低；备案周期 1–2 周。
- 风险：Supabase 海外网络延迟（登录、查询、上传都走海外），国内网络下可能时快时慢。
- 优点：最快上线、不碰数据、不碰代码。
- 缺点：只解决了"前端"访问，数据库/存储/登录仍依赖海外 Supabase。

## 8. 国内正式生产方案（方案 B）

架构：国内服务器 + Next.js + PostgreSQL（腾讯云 PG / 阿里云 RDS）+ COS/OSS + 自建或云 Auth + API。

- 成本：服务器 + 数据库（几十至几百元/月）+ 对象存储 + 短信（如用手机号登录）。
- 工作量：约 2–4 周（Auth + Storage + DB 迁移为主）。
- 风险：数据迁移一致性、Supabase Auth 密码无法导出（需用户重置）、RLS 逻辑重写、存量图片 URL 全局替换。
- 优点：全链路国内、访问最稳、可短信登录。
- 缺点：改造大，需要停服窗口与回归测试。

## 9. 数据库迁移风险

- 20 张表 + 65 条 RLS：需要 `pg_dump`/逻辑备份迁移到目标 PostgreSQL，并重建约束、索引、函数（`create_order_with_items`、排程 5 个事务函数、日历种子数据）。
- 风险点：迁移期间写库一致性（需要停服或双写）；RLS 依赖 `auth.uid()`，换 Auth 后必须同步改；备份与校验（行数、外键、序列）。

## 10. 文件迁移风险

- 存量照片/附件路径存于多张表（`photo_url/photo_path`、附件 `file_url/file_path`），且图片 URL 是 Supabase 域名。
- 迁移 = 对象复制到 COS/OSS + **全库 URL 重写** + `next.config` 图片域名替换 + 上传层换实现。
- 风险：漏改任一 URL 形式（报告导出、客户门户、检品页）都会出现图片裂图；建议先迁 Storage 并做 URL 兼容（可保留旧域名跳转）。

## 11. Auth 迁移风险

- Supabase Auth 密码不能导出 → 老用户需走"重置密码"流程。
- 邀请码、邮箱确认邮件由 Supabase 服务提供 → 自建需接邮件服务（或短信）。
- RLS 中大量 `auth.uid()`/JWT email 判断 → 迁移后需替换为自建用户体系。
- 客户端 `userApi.ts` 直连 profile/invites 需改为 API 路由。

## 12. Realtime 迁移风险

- 唯一订阅、单一页面使用；关闭后手动刷新即可，风险极低。

## 13. 当前项目可以直接复用的部分

- 全部分层架构：页面 → API → Service → 数据，业务代码与 UI 完全可复用。
- 排程引擎（纯 TS + 测试）、报告导出（exceljs/jspdf）、图片压缩、权限角色模型。
- `Dockerfile`、`supabase/schema.sql` 与 RLS SQL（可转为目标库建库脚本）、环境变量结构。
- `src/api` 访问层：换数据源实现时只需改这一层内部。

## 14. 必须修改的部分

- 部署与环境变量（Vercel → 服务器，`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 注入方式）。
- `next.config.mjs` 图片域名（若换存储）。
- `src/api/storageApi.ts` 等 4 个 storage 客户端（若换 OSS/COS）。
- `userApi.ts` / `AuthGuard.tsx` / `src/server/supabaseServer.ts`（若换 Auth）。
- `ordersApi.subscribeOrdersProgress`（若关 Realtime，改手动刷新）。
- 客户端直查 `user_profiles` / `registration_invites` 的 5 处（改 API 路由）。

## 15. 建议迁移顺序

1. 方案 A 先行：国内服务器 + Docker + 备案 + HTTPS，Supabase 不动（1–2 天 + 备案等待）。
2. 观察 Supabase 延迟：先迁 Storage（图片影响最大），再迁数据库，最后 Auth。
3. 关闭 Realtime（改手动刷新）作为低风险前置项。
4. 方案 B 完整落地：自建 Auth（短信/邮箱）+ PostgreSQL + COS/OSS。

## 16. 预计开发工作量

- 方案 A：1–2 天部署（不含备案等待）。
- 方案 B：DB 迁移 3–5 天；Storage 2–3 天；Auth 3–5 天；联调回归 1–2 周；合计约 2–4 周。

## 17. 当前不建议修改的部分

- 数据库 schema、RLS、SQL：现在不动（迁移时再重建）。
- UI、业务功能、排程引擎、现有 API 行为：一律不动。
- 不要提前把 `user_profiles` 直连改成 API（等 Auth 迁移一并做，避免两次返工）。

## 附：关键问题速答

1. 能否直接部署到国内服务器？可以——方案 A 只需部署配置改动。
2. 只换 Vercel 需要改什么？环境变量注入 + 图片域名 + 备案/HTTPS；代码基本不动。
3. 继续用 Supabase 的网络依赖？数据库/存储/登录/Realtime 都走 `*.supabase.co`（海外），国内访问不稳定。
4. 完全脱离 Supabase 要迁移什么？20 表 + 65 RLS、全部存储对象与 URL、Auth 用户/邀请码/邮件、Realtime 订阅改轮询。
5. 当前 API 架构是否支持迁移？支持——页面不直连，数据访问集中在 `src/api`。
6. Storage 是否容易迁移？中——集中在 4 个客户端文件 + 全库 URL 重写。
7. Auth 是否容易迁移？难——密码不可导出、邀请码/邮件依赖 Supabase、RLS 依赖 auth.uid()。
8. Realtime 是否是主要难点？不是——仅 1 处订阅，可先关闭。
9. 数据库迁移最大风险？迁移一致性 + RLS 与 Auth 耦合 + 停服窗口。
10. 还需哪些工程化准备？CI/CD（推送即构建部署）、日志/监控、备份策略、域名备案、HTTPS、数据校验脚本。
