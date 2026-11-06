# QCFlow 自建认证

## 当前开关

- `AUTH_BACKEND=supabase`：保持现有 Supabase Auth，行为不变。
- `AUTH_BACKEND=local`：服务端使用自建会话。
- `NEXT_PUBLIC_AUTH_BACKEND=local`：浏览器端使用自建认证 API。

两个开关必须一致。`local` 模式要求 `DATA_BACKEND=pg`，因为自建会话不能作为 Supabase JWT 使用。

## 必需环境变量

- `JWT_SECRET`：至少 32 位随机值，仅服务端保存。
- `AUTH_COOKIE_SECURE=true`：正式 HTTPS 环境必须保持 true。
- `AUTH_BASE_URL`：密码重置邮件中使用的正式域名。
- `EMAIL_PROVIDER`：`smtp` 或 `tencent-ses`。
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`：SMTP 模式配置。
- `TENCENT_SES_SECRET_ID`、`TENCENT_SES_SECRET_KEY`、`TENCENT_SES_REGION`、`TENCENT_SES_FROM_EMAIL`、`TENCENT_SES_TEMPLATE_ID`：腾讯云 SES API 模式配置。

腾讯云 SES 模板必须包含变量 `{{reset_url}}`。API 模式不需要发信地址的 SMTP 密码。

## 数据库变更

迁移文件：`supabase/migrations/202611050001_local_auth.sql`。

它新增：

- `users.password_hash`
- `users.email_verified_at`
- `users.failed_login_attempts`
- `users.locked_until`
- `auth_sessions`
- `password_reset_tokens`

该迁移只加入仓库，本轮没有执行。正式切换前必须先在测试库执行、验证并备份。

## 账号迁移

Supabase 密码哈希不可导出。迁移 `user_profiles` 后：

1. 为每个账号创建对应的 `public.users` 记录。
2. 不设置密码哈希。
3. 通过受控的密码重置流程设置首个密码。
4. 重置成功后会自动撤销该账号的所有旧会话。

管理员不能通过公开注册接口自行创建无邀请码账号；管理员账号同样通过受控迁移和密码重置初始化。

## 安全机制

- 密码使用 Node.js `scrypt` 加盐哈希。
- 会话 JWT 使用 HS256 签名，并绑定数据库中的可撤销会话 ID。
- 浏览器令牌只放在 `HttpOnly`、`SameSite=Lax` Cookie 中。
- 账号连续失败 5 次后锁定 15 分钟。
- 邀请码只在生成时显示一次，数据库只保存 SHA-256 哈希。
- 密码重置令牌 30 分钟过期、只可使用一次；重置后撤销所有会话。
