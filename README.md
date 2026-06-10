# tempMail2cfPage

一个用于 Cloudflare Temp Email Worker 的自用前端页面。

## 说明

- 后端基于 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email)。
- 前端接口、鉴权头和主要业务流程参考该项目原始前端实现。
- 本仓库只维护一个独立 Cloudflare Pages 前端，不包含 Worker 后端代码。
- 用户注册、用户中心等模块已省略；保留页面密码访问、临时邮箱、邮件查看和 Admin 常用功能。

## 功能

- 页面密码入口，对应 Worker 的 `PASSWORDS` 配置。
- 创建临时邮箱，支持域名选择和手动编辑邮箱名前缀。
- 收件箱列表、搜索、刷新、删除邮件。
- 清空当前收件箱。
- 邮件详情支持 `纯文本` / `原文` 切换。
- 邮件附件解析和下载，基于邮件 `raw` 内容。
- 删除当前邮箱地址。
- Admin 登录。
- Admin 统计、地址列表、地址凭证复制、按地址查看邮件、删除地址、删除邮件。
- Admin 页面通过 `/admin` 访问，主界面不展示 Admin 入口。
- 桌面端三列布局，移动端底部标签切换。

## 配置

默认使用 Cloudflare Pages Functions 同源转发到 Worker 后端。复制 `.env.example` 为 `.env`：

```env
VITE_API_BASE=
```

`VITE_API_BASE` 为空时，前端会请求当前 Pages 域名下的 `/api`、`/admin`、`/open_api`，再由 Pages Functions 通过 `BACKEND` service binding 转发到 Worker。

如果不使用 Pages Functions，也可以把 `VITE_API_BASE` 显式设置为已经部署好的 Cloudflare Worker API 域名：

```env
VITE_API_BASE=https://your-worker.example.com
```

结尾不要加 `/`。

### Cloudflare Pages Functions 绑定

使用同源转发时，需要在 Cloudflare Pages 项目里配置 service binding：

```text
Binding name: BACKEND
Service: temp-mail
Environment: production
```

本项目的代理文件位于：

```text
functions/api/[[path]].js
functions/admin/[[path]].js
functions/open_api/[[path]].js
```

## 本地运行

```powershell
pnpm install
pnpm dev
```

## 构建

```powershell
pnpm build
```

Cloudflare Pages 构建配置：

```text
Framework preset: Vite
Build command: pnpm build
Build output directory: dist
```

## 接口约定

本前端沿用上游项目的鉴权方式：

- 页面密码：`x-custom-auth`
- 地址 JWT：`Authorization: Bearer <jwt>`
- 管理员密码：`x-admin-auth`

主要接口：

- `GET /open_api/settings`
- `POST /api/new_address`
- `GET /api/settings`
- `GET /api/mails`
- `DELETE /api/mails/:id`
- `DELETE /api/delete_address`
- `POST /open_api/admin_login`
- `GET /admin/statistics`
- `GET /admin/address`
- `GET /admin/mails`
