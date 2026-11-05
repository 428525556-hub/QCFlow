# QCFlow COS 存储迁移

## 开关

- `STORAGE_BACKEND=supabase`：保持现有 Supabase Storage。
- `STORAGE_BACKEND=cos`：上传改走腾讯云 COS。
- `NEXT_PUBLIC_STORAGE_BACKEND=cos`：浏览器生成新文件 URL 时改用 COS 公共域名。

服务端和浏览器开关必须同时切换。

## 服务端配置

- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_REGION`
- `COS_BUCKET_INSPECTION_PHOTOS`
- `COS_BUCKET_ORDER_ATTACHMENTS`
- `COS_INSPECTION_PHOTOS_BASE_URL`
- `COS_ORDER_ATTACHMENTS_BASE_URL`

密钥变量不能使用 `NEXT_PUBLIC_` 前缀。

## 浏览器公开配置

- `NEXT_PUBLIC_COS_INSPECTION_PHOTOS_BASE_URL`
- `NEXT_PUBLIC_COS_ORDER_ATTACHMENTS_BASE_URL`

公共域名必须与 Bucket 或 CDN 的实际公开访问地址一致。

## Bucket 要求

- 两个逻辑 Bucket 分别承接检品/出货照片和订单附件。
- 应用只通过服务端上传，不需要向浏览器暴露 COS 永久密钥。
- 当前生产 Bucket 使用私有读写，文件通过登录鉴权的 API 代理读取。
- 建议开启访问日志和生命周期策略。

## 当前测试 Bucket

- 照片：`qcflow-inspection-1451475451`
- 附件：`qcflow-attachments-1451475451`
- 地域：`ap-shanghai`
- 权限：私有读写、单 AZ
- 应用凭据：专用子账号 `qcflow-cos-app`，仅允许上述两个 Bucket 的对象读写、HEAD 和删除

应用上传后返回 `/api/storage/object` 代理地址；数据库只保存稳定的对象路径和代理 URL，不保存会过期的签名地址。

## 存量文件迁移

先验证本地备份文件：

```powershell
node scripts/migrate-storage-to-cos.mjs --run-dir <backup-run-dir>
```

确认后上传：

```powershell
node scripts/migrate-storage-to-cos.mjs --run-dir <backup-run-dir> --apply
```

脚本会生成 `cos-migration-report.csv`，并验证远端文件大小。

## 数据库 URL 重写

先检查：

```powershell
node scripts/rewrite-storage-urls-cos.mjs --run-dir <backup-run-dir> --old-base <old-supabase-url>
```

确认后才执行：

```powershell
node scripts/rewrite-storage-urls-cos.mjs --run-dir <backup-run-dir> --old-base <old-supabase-url> --apply
```

脚本覆盖检品照片、开箱照片、出货照片和订单附件。存在无法识别的旧 URL 时会中止，不修改数据库。
