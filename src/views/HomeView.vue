<script setup lang="ts">
// 主页 Tabs 容器：PC 顶部导航栏 / 手机底部 TabBar，子路由渲染各列表页
// 组件名供 App.vue 的 KeepAlive include 匹配（返回首页保活不刷新）
defineOptions({ name: 'HomeView' })
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { usePixivAuthStore } from '../stores/pixivAuth'
import { useRelayAuthStore } from '../stores/relayAuth'

const pixiv = usePixivAuthStore()
const relay = useRelayAuthStore()
const router = useRouter()

const TABS = [
  { to: '/recommend', label: '推荐' },
  { to: '/follow', label: '关注' },
  { to: '/rank', label: '排行' },
  { to: '/search', label: '搜索' },
  { to: '/bookmark', label: '收藏' },
]

function logoutAll() {
  pixiv.logout()
  relay.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="home">
    <!-- PC 顶部导航栏 -->
    <header class="topbar">
      <span class="logo">ArkPix Web</span>
      <nav class="top-tabs">
        <RouterLink
          v-for="tab in TABS"
          :key="tab.to"
          :to="tab.to"
          class="top-tab"
          active-class="active"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>
      <div class="account">
        <span v-if="pixiv.user" class="username">{{ pixiv.user.name }}</span>
        <RouterLink to="/history" class="settings-link">历史</RouterLink>
        <RouterLink to="/settings" class="settings-link">设置</RouterLink>
        <button class="secondary logout-btn" @click="logoutAll">退出</button>
      </div>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <!-- 手机底部 TabBar -->
    <nav class="tabbar">
      <RouterLink
        v-for="tab in TABS"
        :key="tab.to"
        :to="tab.to"
        class="tabbar-item"
        active-class="active"
      >
        {{ tab.label }}
      </RouterLink>
      <RouterLink to="/settings" class="tabbar-item" active-class="active">设置</RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 16px;
  height: 52px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.logo {
  font-size: 17px;
  font-weight: 600;
  color: var(--accent);
  flex-shrink: 0;
}
.top-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
}
.top-tab {
  padding: 6px 14px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 14px;
}
.top-tab:hover {
  color: var(--text);
}
.top-tab.active {
  color: var(--accent);
  font-weight: 600;
  background: var(--bg);
}
.account {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.username {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.settings-link {
  font-size: 13px;
}
.logout-btn {
  padding: 4px 12px;
  font-size: 13px;
}
.content {
  flex: 1;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}
.tabbar {
  display: none;
}
@media (max-width: 767px) {
  .topbar {
    display: none;
  }
  .content {
    padding: 8px 8px 64px;
  }
  .tabbar {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
  }
  .tabbar-item {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .tabbar-item.active {
    color: var(--accent);
    font-weight: 600;
  }
}
</style>
