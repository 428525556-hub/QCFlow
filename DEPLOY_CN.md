# QCFlow 国内网络部署方案

Vercel 在国内网络下可能不稳定。要让国内手机网络更稳定访问，可以换到国内云厂商。

## 推荐选择

### 方案 A：香港服务器，最快上线

适合现在马上用。

- 推荐：腾讯云轻量应用服务器香港、阿里云轻量应用服务器香港
- 优点：国内访问通常比 Vercel 稳，不需要ICP备案
- 缺点：数据库仍在 Supabase 海外，登录和上传速度还取决于 Supabase

### 方案 B：中国大陆服务器，最稳但需要备案

适合长期正式业务。

- 推荐：腾讯云上海/广州、阿里云杭州/上海
- 优点：国内网络最稳
- 缺点：域名通常需要ICP备案；备案完成前不能用域名正式对外访问

### 方案 C：全链路国内化，最彻底

前端、数据库、登录、图片存储都迁到国内。

- 前端：腾讯云/阿里云服务器
- 数据库：腾讯云 PostgreSQL / 阿里云 RDS PostgreSQL
- 图片：腾讯云 COS / 阿里云 OSS
- 登录：自建账号系统或国内短信登录

这是后续大改造，不是简单换服务器。

## 香港服务器 Docker 部署

服务器需要安装：

- Docker
- Docker Compose

在服务器创建 `.env.production`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://rexvkdayrhekobvlghiu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_3akH2NmS03q-jPfWGWDpBg_Xi4IlXBn
```

构建：

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://rexvkdayrhekobvlghiu.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_3akH2NmS03q-jPfWGWDpBg_Xi4IlXBn \
  -t qcflow .
```

运行：

```bash
docker run -d \
  --name qcflow \
  --restart always \
  -p 80:3000 \
  qcflow
```

打开：

```txt
http://服务器IP
```

## 域名

如果是香港服务器：

- 可以直接绑定域名
- 一般不需要ICP备案

如果是中国大陆服务器：

- 域名通常需要ICP备案
- 备案完成后再绑定域名

## 注意 Supabase

当前系统仍然使用 Supabase：

- Auth 登录
- Database 数据库
- Storage 图片/附件

所以即使前端换到国内/香港服务器，登录和上传仍会访问 Supabase。如果国内访问 Supabase 慢，后续需要把数据库和存储也迁到国内。
