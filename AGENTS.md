# AGENTS.md — ArkPix Web

ArkPix 的 Web 前端（Vue 3 + Vite + TS + Pinia + Vue Router）。Pixiv 第三方客户端，**禁止浏览器直连 pixiv 域名**，API/图片全部经自托管中继后端 `pixiv-relay`（Go）。

**协议契约**：`ArkPix/docs\backend-design.md` 是唯一权威，端点/错误格式/同步语义改动以它为准（§7 为同步域）。跨端同步结构与鸿蒙端 `ArkPix/entry\src\main\ets\services\SyncService.ets` 对齐（两端同步同一账号的数据）。

## 构建与测试

- `npm install` / `npm run dev`（5173，vite proxy 转发 API 到 localhost:8080，同源免 CORS）
- `npm run build` = `vue-tsc -b && vite build`（类型检查 + 构建，提交前必须过）
- 无单元测试框架；验证手段 = vue-tsc 零错误 + vite build 成功 + dev 下手动/curl 联调
- 部署：`deploy.bat`（build 后清并拷贝 `dist/*` → `..\pix_backend\internal\web\dist\`，后端 go:embed 托管）

## 结构

```
src/api/       relay.ts（authorizedFetch/PostJson/GetJson + relayRequest 信封）、relayAuthApi.ts（register/refresh/ApiError）、
               pixiv.ts（业务 API，写操作 form 编码）、pixivOAuth.ts、image.ts（loadImage/releaseImage 图片缓存）、
               sync.ts（/sync/v1：pushDomain 分批/pullDomain 续页/SyncFullRequiredError/stripTokenFields/游标持久化）、
               admin.ts（/admin/v1 管理端封装：Bearer ADMIN_TOKEN，401 清 token 跳 /admin/login）、types.ts
src/stores/    relayAuth.ts、pixivAuth.ts（双 token，各自单飞刷新锁）、settings.ts、history.ts（均 localStorage 持久化）
src/services/  syncService.ts（四域同步：store $subscribe diff 墓碑 + 2s 防抖 + applyingRemote 防回声 + syncNow 单飞）
src/components/ CachedImage.vue（图片唯一显示入口）、IllustCard、IllustWaterfall、ImageViewer、CommonViews/
src/views/     LoginView、HomeView（Tabs）、home/（推荐·关注·排行·搜索）、IllustDetailView、UserProfileView、
               CommentsView、HistoryView、SettingsView、
               admin/（/admin 管理端：Login/Layout/Overview/Cache/Accounts/Settings，路由守卫只验 admin token）
```

## 关键约定（勿违反）

1. **禁止浏览器直连 pixiv 域名**：一切请求走中继（`/relay/v1/request` 信封透传 Pixiv API）。
2. **图片必须 fetch+Bearer→objectURL**：`/img/v1/fetch` 要鉴权头，`<img>` 裸引不可行；显示图片一律用 `CachedImage` 组件（内部 `loadImage`/`releaseImage` 引用计数配对）。
3. **relay 信封 200 外壳看内层 status**：`/relay/v1/request` 外层 HTTP 200 ≠ 业务成功，必须判解包后的 `result.status`。
4. **双 token 单飞刷新锁**：relay token 与 pixiv token 各自 refresh 都是轮换制，刷新必须经 `refreshRelayTokens`/`refreshPixivTokens` 单飞锁，禁止并发双发。
5. **Pixiv 写操作 form 编码**（`application/x-www-form-urlencoded`），不是 JSON。
6. **sync 上行三铁律**：data 任何层级字段名含 "token"（不区分大小写）会被服务端整批 400——上行前必须过 `stripTokenFields`；单域单批 ≤500 条（`pushDomain` 已自动分批）；409 SYNC_FULL_REQUIRED → 清该域游标全量 pull 重建（`syncService.syncOneDomain` 已处理）。
7. **同步结构兼容**：history key=`String(illustId)` data={title,imageUrl,userName,viewedAt}；search_history key=`${searchType}:${keyword}` data={keyword,searchType}；mute key=`tag:x`/`user:id`/`ai`；settings key=`settings` 整条 LWW。改动前先对鸿蒙端 `SyncService.ets`。Web 端不做 bookmark_snapshot 域。theme 跨端映射：Web `auto` ↔ 鸿蒙 `system`。`syncEnabled` 是设备本地开关，不参与上行。
8. **持久化键**：`arkpix.web.relay` / `arkpix.web.pixiv` / `arkpix.web.settings` / `arkpix.web.history` / `arkpix.web.sync`（每域游标）/ `arkpix.web.sync.meta`（写时间戳、墓碑、上次同步结果）/ `arkpix.web.admin`（管理端 ADMIN_TOKEN，与双 token 体系解耦）。
9. **管理端路由**：`/admin` 前缀（登录页 + 概览/缓存/账号/设置）走独立守卫，只验 `arkpix.web.admin` token，绕开 relay+pixiv 双登录；API 为 `/admin/v1/*`（Bearer ADMIN_TOKEN），dev 代理已含 `/admin` 前缀。

## 部署约定

- 生产形态 = 后端 embed 托管：本仓库不出 docker/CI，构建产物由 `deploy.bat` 送入 pix_backend 后随其后端二进制/镜像分发。
- 同源部署时 `serverUrl` 为空串（relayAuth.normalizeServerUrl），所有 API 路径相对当前源。
