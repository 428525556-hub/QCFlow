# QCFlow 数据迁移

## 原则

- 正式切换前必须重新执行完整备份，不能直接使用旧备份。
- 导入目标必须为空；脚本不会执行 `TRUNCATE`、批量 `DELETE` 或覆盖已有数据。
- 所有业务表在单事务中导入，任何行数不一致都会回滚。
- Supabase 密码哈希不可导出，导入后的用户没有密码，需要走一次密码重置。

## 备份

先停止业务写入或确认没有新写入请求，然后运行：

```powershell
pwsh -File scripts/backup-supabase.ps1 -SecretFile <secret-key-file>
```

确认备份目录中的：

- `metadata.json`
- `db/*.json`
- `storage-manifest.csv`
- `SHA256SUMS.txt`

## 导入预检

```powershell
node scripts/import-backup-to-pg.mjs --run-dir <backup-run-dir>
```

预检不连接数据库，会检查：

- 21 张业务表
- 用户资料与用户外键
- 每张表待导入行数

## 导入测试环境

设置 `DATABASE_URL` 指向独立的测试数据库，然后执行：

```powershell
node scripts/import-backup-to-pg.mjs --run-dir <backup-run-dir> --target staging --apply
```

目标库任何业务表非空时脚本会立即中止。

## 导入正式环境

正式导入需要维护窗口和明确授权：

```powershell
node scripts/import-backup-to-pg.mjs --run-dir <backup-run-dir> --target production --apply --allow-production
```

正式导入前还必须：

1. 冻结 Supabase 写入。
2. 重新生成最新完整备份。
3. 在 staging 完成同一备份的导入和全流程验收。
4. 备份国内 PostgreSQL 并验证恢复。
5. 准备回滚与切换期间增量补录方案。

## 导入后的认证

导入只创建 `public.users` 和 `user_profiles`，不生成密码。

- 管理员先通过受控密码重置设置密码。
- 其他用户通过邀请或密码重置流程恢复访问。
- 不要在数据库中存放明文密码或直接复用 Supabase 密码。
