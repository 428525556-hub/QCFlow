# QCFlow 国内正式生产方案（方案 B）实施蓝图

> 状态：规划稿。未修改任何代码 / 数据库 / UI。待确认选型后分阶段执行。

## 1. 目标架构

```text
国内用户
  ↓ https（ICP 备案域名）
腾讯云轻量服务器（Docker：Next.js，node:20-alpine）
  ↓
PostgreSQL（腾讯云云数据库 或 同机 Docker PG）
腾讯云 COS（检品/开箱/出货照片、检品指示书附件）
自建 Auth（JWT + 邮箱验证码/短信验证码，密码 bcrypt）
业务查询全部走 Next.js API Route（现有分层不变）
```

说明：Realtime 不再使用，订单列表改手动刷新/短轮询。

## 2. 组件选型（默认值，可改）

| 组件 | 默认选型 | 备选 |
| --- | --- | --- |
| 服务器 | 腾讯云轻量 4核4G（已有购买计划） | 阿里云轻量 |
| 数据库 | 腾讯云 PostgreSQL（云数据库，自动备份） | 同机 Docker PostgreSQL（省成本但运维自担） |
| 对象存储 | 腾讯云 COS（标准存储） | 阿里云 OSS |
| Auth | 自建 JWT + bcrypt 密码 + 邮箱验证码（腾讯云 SES/邮件推送或 SMTP） | 手机号短信（腾讯云短信） |
| 邮件/短信 | 先邮箱验证码（成本低），后续加短信 | 腾讯云短信 |
| 域名/HTTPS | 已备案域名 + 腾讯云免费 SSL 证书 | — |
| 部署 | Docker + Nginx 反代 HTTPS | PM2 + next start |

## 3. 代码改造清单（按层，逐文件）

### 环境与配置
- `src/config/env.ts`：新增 `DATABASE_URL`、`JWT_SECRET`、`COS_SECRET_ID/SECRET_KEY/BUCKET/REGION`、`SMTP_*`；移除对 Supabase URL/Key 的依赖。
- `.env.example` / 部署环境变量同步更新。

### 数据访问层（最大改动）
- 新建 `src/server/db.ts`：基于 `pg` 的连接池（连接 PostgreSQL）。
- 新建 `src/server/auth.ts`：JWT 签发/校验（`jsonwebtoken`） + bcrypt 密码哈希。
- `src/server/supabaseServer.ts` → 改为：从 Bearer Token 解析 JWT → 查 `user_profiles` → 返回 user/profile；其余鉴权函数签名不变。
- `app/api/**`（约 25 个路由）：`supabase.from(...)` 替换为 SQL（保留 API 返回结构与错误格式，前端零改动）。
- `src/services/excelImportService.ts`：`supabase.rpc("create_order_with_items")` → 事务 SQL（一个函数完成订单+明细插入）。
- `supabase/schema.sql` + `staff_shared_access.sql` → 转换为目标库初始化脚本（表结构 + 索引 + 函数 + 种子数据）；RLS 改为应用层权限（或保留 PG 角色方案，二选一，建议先应用层）。

### Auth
- 新建 `app/api/auth/*`：register / login / logout / refresh / profile / invite。
- `src/api/userApi.ts`：改为调用上述 API（不再直连 supabase.auth）。
- `components/AuthGuard.tsx`：改用自定义 session（localStorage 存 JWT，`httpClient` 注入 `Authorization`）。
- `app/login/page.tsx`：登录/注册/邀请码表单逻辑改为新 API；邮箱确认改为验证码流程。
- `app/admin/invites/page.tsx`：邀请码读写改 API。

### Storage
- `src/api/storageApi.ts` / `inspectionApi.ts` / `orderAttachmentsApi.ts` / `shipmentApi.ts`：上传/删除改用 COS SDK；URL 改为 `https://<bucket>.cos.<region>.myqcloud.com/<path>`。
- `src/utils/imageUpload.ts`、`components/PhotoPicker.tsx`：不变（只依赖上传函数签名）。
- `next.config.mjs`：`images.remotePatterns` 增加 COS 域名，移除 supabase.co。

### Realtime
- `src/api/ordersApi.ts`：删除 `subscribeOrdersProgress`；`app/orders/page.tsx` 改手动刷新（或 30s 轮询）。

### 保留不动
- 全部页面 UI、业务 Service（含排程引擎）、报告导出、`httpClient` 的请求/响应封装（仅换 token 来源）、错误码体系。

## 4. 数据迁移步骤

1. **建库**：目标 PostgreSQL 执行转换后的建库脚本（20 表 + 索引 + 函数 + 日历种子 + 款式系数种子）。
2. **数据**：`pg_dump`（Supabase 当前库）→ 导入目标库；校验行数、外键、序列。
3. **文件**：COS 建两个 bucket（inspection-photos / order-attachments），用 `coscmd`/对象复制把存量对象拷入（保留原路径）。
4. **URL 重写**：全库把 `https://<project>.supabase.co/storage/v1/object/public/` 前缀替换为 COS 域名（脚本批量 UPDATE 各表 `photo_url` / `file_url`）。
5. **Auth**：Supabase 密码不可导出 → 用户表先导入邮箱/角色/客户，密码统一走"首次登录重置"；邀请码重新生成或导入后重新激活。
6. **切换**：改 DNS/服务器流量到新环境 → 全流程回归（登录、入库、检品、上传、排程、报告、客户门户）。
7. **回滚**：保留 Supabase 环境 2–4 周，新环境只写目标库；发现严重问题可回切（需回切期间的数据回填方案）。

## 5. 分阶段计划

| 阶段 | 内容 | 产出 | 预估 |
| --- | --- | --- | --- |
| P0 | 服务器/域名/备案/COS/PG 就绪，Docker 部署新环境（先用 Supabase 跑通） | 可访问的国内站点 | 1–2 天 + 备案等待 |
| P1 | 后端数据访问层替换（API 路由 → PG），全部接口回归 | 业务接口跑在 PG 上 | 3–5 天 |
| P2 | Auth 自建（注册/登录/JWT/邀请码/验证码） + AuthGuard 改造 | 登录流程可用 | 3–5 天 |
| P3 | Storage 迁 COS + URL 重写 + next.config | 图片上传/显示正常 | 2–3 天 |
| P4 | 存量数据/文件正式迁移 + 灰度切换 + 回滚演练 | 全量上线 | 2–3 天 |
| P5 | 收尾：日志/监控/备份/短信可选 | 稳定运行 | 1–2 天 |

总计约 2–4 周（不含备案等待与你的协调时间）。

## 6. 风险与注意

- 密码迁移：老用户需重置（邮件/短信验证码）。
- URL 重写要覆盖所有表（照片、附件、报告导出里的图片路径）。
- RLS 去除后，权限判断移到 API 层：需回归 client / field_inspector 的只读隔离。
- 事务函数（订单创建、排程 5 个函数）要重写成 PG 函数或事务 SQL，保持行为一致。
- 图片/附件历史路径中如果有含特殊字符的文件名，复制时注意编码。

## 7. 需要你确认/提供

1. 云厂商：默认腾讯云（服务器/COS/PG），是否确认？
2. 数据库形态：腾讯云云数据库 PostgreSQL（推荐，自动备份）还是 Docker 自建？
3. Auth：邮箱验证码（默认）还是手机短信验证码？
4. 是否允许我先在仓库开分支按 P1–P3 做代码改造（本地 + 测试环境验证，不动生产数据）？
5. 备案域名是否已准备？（备案期间可先走方案 A 过渡，备案通过后再切方案 B）
