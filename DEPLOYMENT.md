# QCFlow 上线部署说明

`localhost:3003` 只适合本机测试。要让手机 Wi-Fi、手机流量、外地电脑都能稳定打开，需要把网站部署到云端。

推荐部署方式：Vercel + Supabase。

## 1. 部署到 Vercel

1. 打开 Vercel。
2. 导入这个 Next.js 项目。
3. Framework Preset 选择 `Next.js`。
4. Build Command 保持默认：`next build`。
5. Output Directory 保持默认。

## 2. 配置环境变量

在 Vercel 项目的 Environment Variables 里添加：

```env
NEXT_PUBLIC_SUPABASE_URL=https://rexvkdayrhekobvlghiu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_3akH2NmS03q-jPfWGWDpBg_Xi4IlXBn
```

添加后重新 Deploy 一次。

## 3. Supabase 必须完成

在 Supabase SQL Editor 执行最新的：

```txt
supabase/schema.sql
```

并确认这两个 Storage bucket 存在：

- `inspection-photos`
- `order-attachments`

## 4. 使用方式

部署完成后，Vercel 会给一个正式网址，例如：

```txt
https://qcflow-xxx.vercel.app
```

以后电脑、手机 Wi-Fi、手机流量都打开这个正式网址，不再使用 `localhost:3003`。

## 5. 本地地址和正式地址区别

- `http://localhost:3003`：只在这台电脑本地服务运行时可用。
- `http://192.168.x.x:3003`：只在同一个 Wi-Fi 下可用。
- `https://...vercel.app`：云端正式地址，手机流量也可用。
