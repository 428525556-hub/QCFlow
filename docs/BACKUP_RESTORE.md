# QCFlow PostgreSQL 备份与恢复

## 备份

先执行默认 DRY RUN：

```powershell
pwsh -File scripts/backup-postgres.ps1
```

确认目标无误后执行：

```powershell
pwsh -File scripts/backup-postgres.ps1 -Apply
```

脚本行为：

- 在目标容器内执行 `pg_dump -Fc`
- 服务器保留一份备份
- 下载到本机 `backup/postgres-runs/<timestamp>/`
- 校验远端和本地 SHA256 一致
- 不删除任何历史备份

## 恢复验证

恢复操作不能在正式库直接试验。应使用隔离 staging 容器验证：

1. 停止 staging 应用写入。
2. 在 staging PostgreSQL 中创建独立的验证数据库。
3. 使用 `pg_restore` 恢复备份。
4. 校验表数量、关键表行数和外键。
5. 验证完成后删除验证数据库。

正式恢复需单独授权，并先完成最新备份和回滚窗口确认。

## 上线前最低要求

- 每次数据迁移前生成新的 Supabase 全量备份。
- 正式切换前生成国内 PostgreSQL 备份。
- 两种备份都至少有一份异机副本。
- 备份文件与 SHA256 清单分开保存。
- 至少完成一次 staging 恢复演练。
