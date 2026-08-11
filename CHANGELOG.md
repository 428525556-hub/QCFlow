# Changelog

## 0.5.0 - 2026-08-11

### 权限与安全

- 统一 RLS 权限模型：staff/admin 可共享读写全部订单与明细，client 只读本客户数据，出差检品账号仅限本客户 field 订单；`supabase/schema.sql` 与 `supabase/staff_shared_access.sql` 收敛为同一套权威策略。
- 修复合入的 SQL 迁移冲突：邀请码 role 约束补上 `field_inspector`；检品记录删除策略改为仅限本人或 admin。
- API 路由增加统一角色校验：订单、明细、预约箱号、出货、二次检品等写入接口仅限 staff/admin；客户账号禁止写入业务表。
- 消除 RLS 静默失败：更新/删除未命中记录时接口现在返回明确的 404，不再显示“保存成功但未生效”。
- 检品记录删除按钮仅在记录本人或管理员可见。
- 管理员邮箱统一收敛到 `lib/security.ts` 的 `ADMIN_EMAIL`，移除散落的硬编码。

### 功能修复

- 订单列表“入库日期”改为显示真实的 `inbound_date`。
- 报告统计基准改为已入库数量（`inbound_quantity || quantity`），与订单进度口径一致。
- 报告 PDF/Excel 导出增加错误提示与容错，不再无提示失败。
- 预约创建失败时自动清理已创建的孤儿订单，并防止重复提交。
- 入库页移除无意义的 `order_type` 回写。
- 出货差异统计按“订单号/货号/颜色/尺码”精确匹配，避免同色码不同货号被合并。

### 重复与清理

- 打破 `lib/imageUpload` 与 `src/utils` 的循环引用。
- 装箱页两处重复的颜色/尺码/数量编辑器抽离为共享组件；照片上传 UI 抽离为 `components/PhotoPicker`。
- AuthGuard 登录跳转逻辑去重；`syncOrderItemIdentity` 与报告分组逻辑循环化。
- 箱号解析统一到 `lib/cartonNumbers.parseCartonNo`；预约页复用 `createSafeId` / `safeFileName`。
- 删除未使用的 `src/components`、`src/hooks`、`src/layouts`、`src/store`、`src/styles`、`src/assets` 及若干死导出。

## Version Roadmap

- v0.1.0 登录
- v0.2.0 订单
- v0.3.0 检品
- v0.4.0 报告
- v0.5.0 权限加固与代码整理

## 0.1.0 - 2026-07-10

- 建立 `src` 工程化目录结构。
- 新增 `src/config`，统一读取 Supabase 环境变量。
- 新增 `src/api`，页面和组件不再直接访问 Supabase。
- 新增 `src/services`、`src/types`、`src/constants`，为后续业务逻辑拆分打基础。
- 新增基础 UI 组件骨架：Button、Card、Input、Modal、Table、Loading、Toast、PhotoUpload。
- 整理 README、LICENSE、Prettier 配置和 `.gitignore`。
- 迁移订单列表、总单管理、入库、预约创建的数据访问到 API 层。
- 迁移检品、X线、二次检品的数据访问和照片/附件上传到 API 层。
- 迁移日历、客户看板、开箱、装箱、出货、登录/注册的数据访问到 API 层。
- 迁移首页、管理员邀请码、客户订单详情、报告页、装箱详情、出货详情的数据访问到 API 层。
- 抽离订单进度、客户分组、日历汇总、Dashboard 指标、装箱/出货统计、客户详情汇总、报告汇总到 Service 层。
- 抽离图片压缩、安全文件名、超时包装等通用工具到 `src/utils`。
- 完成页面和组件层 Supabase 直连清理。
- 收口旧 `lib/imageUpload.ts`，上传逻辑统一进入 `src/api/storageApi.ts`。
- 验证 Supabase 调用只保留在 `src/api` 边界内。
- 将出货详情页预览图改为 Next.js Image，消除构建警告。
- 修复部分历史编码内容导致的构建风险。
- 验证生产构建通过。
