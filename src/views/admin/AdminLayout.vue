<script setup lang="ts">
// 管理端布局：顶部导航（概览/缓存/账号/设置）+ 退出登录 + 返回客户端
import { useRouter } from 'vue-router'
import { clearAdminToken } from '../../api/admin'

const router = useRouter()

const navItems = [
  { name: 'admin-overview', label: '概览' },
  { name: 'admin-cache', label: '缓存' },
  { name: 'admin-accounts', label: '账号' },
  { name: 'admin-settings', label: '设置' },
] as const

function logout() {
  clearAdminToken()
  router.replace({ name: 'admin-login' })
}
</script>

<template>
  <div class="admin-layout">
    <header class="topbar">
      <span class="brand">ArkPix 服务端管理</span>
      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-link"
          active-class="active"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="actions">
        <router-link class="nav-link" to="/">返回客户端</router-link>
        <button class="secondary logout-btn" @click="logout">退出</button>
      </div>
    </header>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 52px;
  background: var(--bg-card);
  box-shadow: var(--shadow);
  flex-wrap: wrap;
}
.brand {
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.nav {
  display: flex;
  gap: 4px;
  flex: 1;
}
.nav-link {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: var(--radius);
}
.nav-link.active {
  color: var(--accent);
  background: var(--bg);
  font-weight: 600;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.logout-btn {
  padding: 6px 12px;
  font-size: 13px;
}
.content {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
@media (max-width: 767px) {
  .topbar {
    height: auto;
    padding: 8px;
    gap: 8px;
  }
  .content {
    padding: 8px;
  }
}
</style>
