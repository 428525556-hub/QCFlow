# QCFlow

QCFlow 是用于鞋服检品业务的订单、预约、入库、开箱、检品、X线检品、二次检品、装箱、出货和报告管理系统。

当前项目使用 Next.js App Router、TypeScript、Tailwind CSS 和 Supabase。项目正在从快速迭代版本整理为可长期维护的正式商业项目。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Auth / Database / Storage
- Vercel

## 本地运行

1. 安装依赖：

```bash
pnpm install
```

2. 创建环境变量文件：

```bash
cp .env.example .env.local
```

3. 填入 Supabase 配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

4. 在 Supabase SQL Editor 执行数据库脚本：

```txt
supabase/schema.sql
```

5. 启动开发环境：

```bash
pnpm dev
```

## 常用命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
```

## 目录说明

```txt
app/                 Next.js 页面路由入口
components/          当前仍在使用的历史公共组件
lib/                 历史兼容入口，逐步迁移到 src
src/api/             Supabase 数据库、认证、存储访问层
src/services/        业务计算和业务流程封装
src/components/      新的通用组件目录
src/constants/       缺陷类型、订单状态、权限、存储桶等常量
src/config/          环境变量与运行配置
src/hooks/           通用 React hooks
src/layouts/         页面布局
src/types/           统一 TypeScript 类型入口
src/utils/           通用工具函数
supabase/            数据库 schema
outputs/             阶段性 SQL 输出
public/              静态资源
```

## 开发规范

- 页面只负责展示和用户交互。
- Supabase 请求统一放到 `src/api`。
- 业务计算统一放到 `src/services`。
- 通用类型统一从 `src/types` 引用。
- 常量统一放到 `src/constants`。
- 新的通用 UI 组件放到 `src/components/ui`。
- 不在页面里硬编码 Supabase URL、Key、缺陷类型、权限角色。
- 数据库结构变化必须同步 SQL 文件。
- 修改后至少执行一次 `pnpm build`。
- 项目已提供 `.prettierrc`，正式接入 Prettier 时需要同步安装依赖并更新锁文件。

## 环境变量

正式项目必须配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

缺少环境变量时，应用会直接报错，避免误连错误项目。

## 部署

当前使用 Vercel 部署。部署前确认：

- Vercel 已配置环境变量
- Supabase SQL 已执行
- Supabase Storage bucket 已创建
- 本地 `pnpm build` 通过

## 后端 API

业务数据正在逐步迁移到 Next.js Route Handlers。接口鉴权、统一响应、请求 ID、结构化日志、异常处理和事务说明见 `docs/API.md`。

## 当前工程化状态

- 页面和组件层已经不直接调用 Supabase。
- Supabase 访问集中在 `src/api`。
- 常见业务统计已经进入 `src/services`。
- 历史 `lib/` 和根目录 `components/` 仍保留兼容入口，后续会逐步迁移到 `src/`。
