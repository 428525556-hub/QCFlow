# Changelog

## Version Roadmap

- v0.1.0 登录
- v0.2.0 订单
- v0.3.0 检品
- v0.4.0 报告

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
