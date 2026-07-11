# QCFlow 工程化整理报告

日期：2026-07-10

## 当前项目结构

QCFlow 当前是 Next.js App Router 项目。业务页面保留在 `app/`，历史公共组件保留在 `components/`，历史工具入口保留在 `lib/`。

本次没有强行迁移到 React + Vite。原因是当前系统已经围绕 Next.js 路由、Vercel 部署、App Router 页面结构运行。直接迁移到 Vite 会改变路由、部署方式、环境变量规则和页面入口，风险过大。当前更稳妥的方式是保留 Next.js，并建立正式的 `src/` 分层。

## 已完成

- 建立标准 `src/` 目录结构。
- Supabase Client 封装到 `src/lib/supabaseClient.ts`。
- 旧入口 `lib/supabaseClient.ts` 保持兼容。
- Supabase URL 和 Key 从环境变量读取。
- 页面和组件层不再直接调用 Supabase。
- Supabase 数据库、认证、存储调用集中到 `src/api`。
- 常用业务计算迁移到 `src/services`。
- 通用类型入口建立在 `src/types`。
- 常量入口建立在 `src/constants`。
- 基础 UI 组件骨架建立在 `src/components/ui`。
- 图片压缩、安全文件名、超时包装等工具迁移到 `src/utils`。
- 旧 `lib/imageUpload.ts` 改为兼容导出，不再直接调用 Supabase。
- README、CHANGELOG、LICENSE、`.gitignore`、ESLint、Prettier 配置已整理。
- 生产构建通过。
- TypeScript 独立检查通过。

## 已迁移到 API 层的模块

- 登录 / 注册 / 邀请码
- 首页 Dashboard
- 订单列表
- 总单管理
- 预约入库
- 订单入库
- 检品
- X线检品
- 二次检品
- 日历
- 客户端只读看板
- 客户订单详情
- 开箱
- 装箱
- 装箱详情
- 出货
- 出货详情
- 检品报告
- 指示书附件上传
- 检品照片上传
- 开箱照片上传
- 出货照片上传

## 已迁移到 Service 层的逻辑

- Dashboard 指标统计
- 订单进度计算
- 客户分组统计
- 客户看板订单不良统计
- 客户订单详情不良统计
- 日历每日入库 / 出货汇总
- 装箱列表统计
- 出货列表统计
- 出货详情差异统计
- 检品报告缺陷汇总
- 二次检品修正后的最终不良数量计算
- 图片压缩和文件工具

## 未改变

- 未新增业务功能。
- 未修改数据库结构。
- 未改变 UI 流程。
- 未改变用户权限规则。
- 未改变部署配置。

## 仍可继续优化

1. 复杂导出逻辑还可以继续拆分。
   Excel/PDF 生成代码仍有一部分留在页面中，后续建议迁移到 `src/services/reportService` 或 `src/utils/export`。

2. UI 组件还没有完全替换。
   已建立 Button、Card、Input、Modal、Table、Loading、Toast、PhotoUpload 等组件骨架，但旧页面仍有大量 Tailwind 重复样式。

3. 历史文案编码需要专项人工校对。
   当前构建可通过，但部分历史页面文案曾出现乱码，建议后续用浏览器逐页核对。

4. Git 当前不可用。
   当前系统环境识别不到 `git` 命令，无法在本机完成 Git 初始化、提交或状态检查。

5. Prettier 依赖暂未安装。
   项目已有 `.prettierrc`，但当前环境不能访问 npm registry，同步锁文件失败。为避免 `package.json` 和 `pnpm-lock.yaml` 不一致，暂未加入 Prettier 依赖。

## 验证结果

- `next build` 通过。
- `tsc --noEmit` 通过。
- 页面和组件层 Supabase 直连扫描通过。
- Next.js 构建无页面代码警告。
