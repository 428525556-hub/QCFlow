# QCFlow — Agent 规则

QCFlow 是鞋服检品管理系统（Next.js 14 App Router + TypeScript + Tailwind + Supabase），已部署腾讯云 `124.221.179.150`，正在等待国内域名备案上线。

## 先读什么

- 详细规则与项目上下文在全局 skill **`qcflow-engineering`**（`~/.codex/skills/qcflow-engineering/`）：先看它的 `SKILL.md`，再按路由只读需要的 `references/*.md`
- 不要整库通读；用搜索和调用链定位相关文件

## 环境

- 本地开发 / 测试 / 腾讯云生产必须分清，不确定就先问
- 未经明确授权禁止：重启生产服务、动容器/卷/服务器文件、改环境变量、改 nginx/DNS/SSL、写生产库、跑迁移、删数据、改 RLS
- API Key、数据库密码、JWT Secret、生产环境变量**不得**出现在聊天或报告里

## 命令

```bash
pnpm dev        # 本地开发
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm build      # next build
pnpm test       # node --test
```

## 结构

`app/`（页面 + API 路由）· `src/`（api / server / services / scheduling / constants / types / utils）· `components/` · `lib/`（历史兼容层）· `supabase/`（SQL）· `docs/` · `deploy/`

## 改动规则

- 先理解需求与现有实现，再动手；最小改动；不顺手重构；发现别的问题只记录不擅自修改
- 数量、订单、检品、出货、客户等核心业务字段默认只读分析；需要改库时先说明「为什么 / 改什么 / 影响哪些数据 / 能否不改」，等确认

## 当前状态（2026-09-25）

- 分支 `restore/2026-09-01-baseline`（基线提交 `2b5e06d`）；`origin/main` 停在 2026-08-19 `d7309de`，**本地未推送**
- 数据层仍是 Supabase（Auth + Postgres + Storage，海外，7 天无活动会暂停）；腾讯云国内 PG 是**空库待命**，因认证/直连/RPC 三个阻塞点暂不能切换
- 无自动备份、无 CI/CD；域名未解析、80/443 未开放，目前只有 `http://124.221.179.150:8443` 可访问
