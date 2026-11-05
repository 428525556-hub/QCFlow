# QCFlow 域名与 HTTPS

## 目标

- `syqcflow.cn` → `124.221.179.150`
- `www.syqcflow.cn` → `124.221.179.150`
- HTTP 自动跳转 HTTPS
- HTTPS 反向代理到 `127.0.0.1:8443`
- 使用 Let's Encrypt 自动续期

## DNS

在 DNSPod 添加：

| 主机记录 | 类型 | 记录值 | TTL |
| --- | --- | --- | --- |
| `@` | A | `124.221.179.150` | 600 |
| `www` | A | `124.221.179.150` | 600 |

使用 DNSPod 授权 API 时，必须确认修改的是 `syqcflow.cn`，不要操作其他域名。

## 安全组

腾讯云防火墙/安全组需允许：

- TCP 80
- TCP 443

不要开放 PostgreSQL 5432 或应用内部端口 3000。

## 证书

服务器已安装 certbot。DNS 生效后执行：

```bash
certbot certonly \
  --webroot \
  -w /var/www/html \
  -d syqcflow.cn \
  -d www.syqcflow.cn \
  --email shuoyuqc@163.com \
  --agree-tos \
  --no-eff-email \
  --non-interactive
```

证书目录：

```text
/etc/letsencrypt/live/syqcflow.cn/fullchain.pem
/etc/letsencrypt/live/syqcflow.cn/privkey.pem
```

## 启用 nginx

```bash
cp /root/deploy/nginx-qcflow.conf.next /etc/nginx/conf.d/qcflow.conf
nginx -t
systemctl reload nginx
```

自动续期部署钩子：

```text
/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## 验证

```bash
nginx -t
curl -I http://syqcflow.cn
curl -I https://syqcflow.cn
curl -I https://www.syqcflow.cn
systemctl status certbot.timer
```

验证内容：

- HTTP 301 到同一个 HTTPS 域名
- TLS 证书覆盖根域名和 `www`
- 页面返回 200
- `/api/auth/session` 能正常返回 401 而不是网关错误
- certbot 续期定时器处于 active 状态
