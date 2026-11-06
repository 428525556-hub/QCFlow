# QCFlow 独立测试环境

## 隔离边界

测试环境使用独立的容器、端口、数据库卷和环境变量：

| 项目 | 测试环境 | 腾讯云生产 |
| --- | --- | --- |
| Compose 项目 | `qcflow-staging` | 当前为手工 Docker 容器 |
| 应用端口 | 仅本机 `127.0.0.1:9443` | 公网 `8443` |
| 数据库端口 | 仅本机 `127.0.0.1:5433` | 仅本机 `5432` |
| 数据库卷 | `qcflow_staging_pgdata` | `qcflow_pgdata` |
| 认证 | `AUTH_BACKEND=local` | 当前 Supabase |
| 数据库 | `DATA_BACKEND=pg` | 当前 Supabase |
| 存储 | `STORAGE_BACKEND=cos` | 当前 Supabase |

测试环境不会占用生产容器名称、端口或数据卷。

## 配置

复制 `deploy/staging/env.example` 为 `deploy/staging/.env.staging`，填写独立测试值。该文件已被 Git 忽略，禁止提交。

数据库首次创建卷时会自动执行 `supabase/production_schema.sql`。已有测试卷不会重复执行初始化脚本。

## 打包预检

```powershell
pwsh -File scripts/deploy-staging.ps1
```

该命令只检查 Git 工作区、生成源码包，不连接服务器。

## 部署

```powershell
pwsh -File scripts/deploy-staging.ps1 -Apply
```

部署只操作 `qcflow-staging` 容器和对应数据卷，不停止生产 `qcflow`。

## 访问

测试服务只监听服务器本机 9443。通过 SSH 隧道访问：

```powershell
ssh -i C:\Users\pc\.ssh\qcflow_deploy_key -N -L 9443:127.0.0.1:9443 root@124.221.179.150
```

浏览器打开 `http://127.0.0.1:9443`。

## 权限回归

先建立 `9443` 和 `5433` 两个 SSH 隧道，再执行：

```powershell
node scripts/smoke-permissions-staging.mjs
```

脚本会临时创建客户与外勤账号，验证跨客户订单、检品和二次检品访问会被拒绝，并在结束时清理测试账号。

## 首次管理员密码

数据导入后，现有管理员没有 Supabase 密码哈希。用受限脚本设置 staging 密码：

```powershell
$env:DATABASE_URL = "<staging-database-url>"
$env:STAGING_ADMIN_PASSWORD = "<local-staging-password>"
node scripts/set-local-password.mjs --email shuoyuqc@163.com --apply
```

密码只写入本地忽略环境文件，不输出到终端或 Git。
