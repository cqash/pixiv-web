# ArkPix Web

ArkPix（Pixiv 第三方客户端）的 Web 前端。浏览器不能直连 Pixiv，一切 API/图片请求都经自托管中继后端 [pix_backend](pixiv-relay)（Go）转发；生产形态下本前端的构建产物 embed 进后端二进制，由后端同源托管。

## 技术栈

Vue 3 + Vite + TypeScript + Pinia + Vue Router，无 UI 组件库（手写样式 + CSS 变量主题）。

## 命令

```bash
npm install       # 安装依赖
npm run dev       # 开发（5173，API 路径经 vite proxy 转发到 localhost:8080，浏览器视角同源免 CORS）
npm run build     # 类型检查 + 构建到 dist/
deploy.bat        # Windows：build 成功后清并拷贝 dist/* 到 ..\pix_backend\internal\web\dist\
```

## 目录结构

```
src/
  api/         # 中继与 Pixiv API 封装：relay.ts（鉴权 fetch + 信封）、pixiv.ts、pixivOAuth.ts、
               # image.ts（图片 fetch→objectURL 缓存）、sync.ts（/sync/v1 分批 push/续页 pull）、types.ts
  stores/      # pinia：relayAuth / pixivAuth（双 token 体系）/ settings / history（均 localStorage 持久化）
  services/    # syncService.ts（四域数据同步：settings/mute/history/search_history，LWW + 墓碑）
  components/  # CachedImage、IllustCard、IllustWaterfall、ImageViewer、CommonViews
  views/       # 登录 / 首页 Tabs（推荐·关注·排行·搜索）/ 详情 / 用户主页 / 评论 / 历史 / 设置
               # + admin/（/admin 服务端管理区：登录、概览、缓存、账号、设置）
  utils/       # base64、日期格式化、画质选档、屏蔽过滤
```

## 与后端的关系

- **开发**：`vite.config.ts` 把 `/auth /relay /img /sync /recover /healthz /admin` 代理到 `localhost:8080`。
- **生产**：`deploy.bat` 把 `dist/` 拷入 `pix_backend/internal/web/dist/`，后端 `go:embed` 托管，同源无 CORS。
- **双 token 体系**：中继账号 token（`/auth/v1/register`，access+refresh 轮换制）管"能不能用中继"；Pixiv token（refresh_token 导入登录）管"能不能取 Pixiv 数据"，两者独立存储、各自单飞刷新。
- **Pixiv 登录**：粘贴 refresh_token（与鸿蒙端「导出 Token」的 JSON 兼容，支持整段粘贴自动提取）。
- **数据同步**：`/sync/v1` 四域（settings/mute/history/search_history），结构与鸿蒙端 `SyncService.ets` 对齐，跨端同步同一账号；`bookmark_snapshot` 域 Web 端不做（只读场景少）。

协议契约权威文档：`ArkPix/docs\backend-design.md`。
