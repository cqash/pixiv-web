// 路由：history 模式（后端 SPA fallback 到 index.html）+ 登录守卫

import { createRouter, createWebHistory } from 'vue-router'
import { useRelayAuthStore } from './stores/relayAuth'
import { usePixivAuthStore } from './stores/pixivAuth'
import { getAdminToken } from './api/admin'

export const router = createRouter({
  history: createWebHistory(),
  // 返回时恢复原滚动位置（配合 HomeView 的 KeepAlive）；前进/新页面回顶
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path !== from.path) return { top: 0 }
  },
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
      children: [
        { path: '', redirect: '/recommend' },
        {
          path: 'recommend',
          name: 'recommend',
          component: () => import('./views/home/RecommendView.vue'),
        },
        { path: 'follow', name: 'follow', component: () => import('./views/home/FollowView.vue') },
        { path: 'rank', name: 'rank', component: () => import('./views/home/RankView.vue') },
        { path: 'search', name: 'search', component: () => import('./views/home/SearchView.vue') },
        {
          path: 'bookmark',
          name: 'bookmark',
          component: () => import('./views/home/BookmarkView.vue'),
        },
      ],
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
    {
      path: '/illust/:id',
      name: 'illust-detail',
      component: () => import('./views/IllustDetailView.vue'),
    },
    {
      path: '/illust/:id/comments',
      name: 'comments',
      component: () => import('./views/CommentsView.vue'),
    },
    {
      path: '/user/:id',
      name: 'user-profile',
      component: () => import('./views/UserProfileView.vue'),
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('./views/HistoryView.vue'),
    },
    // 管理端：独立于客户端双 token 体系，只验 admin token
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('./views/admin/AdminLoginView.vue'),
    },
    {
      path: '/admin',
      component: () => import('./views/admin/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/admin/overview' },
        {
          path: 'overview',
          name: 'admin-overview',
          component: () => import('./views/admin/AdminOverviewView.vue'),
        },
        {
          path: 'cache',
          name: 'admin-cache',
          component: () => import('./views/admin/AdminCacheView.vue'),
        },
        {
          path: 'accounts',
          name: 'admin-accounts',
          component: () => import('./views/admin/AdminAccountsView.vue'),
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('./views/admin/AdminSettingsView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  // /admin 前缀：只验 admin token，绕开 relay+pixiv 双登录守卫
  if (to.path.startsWith('/admin')) {
    if (to.name === 'admin-login') {
      if (getAdminToken()) return { path: '/admin' }
      return true
    }
    if (!getAdminToken()) return { name: 'admin-login' }
    return true
  }
  const relay = useRelayAuthStore()
  const pixiv = usePixivAuthStore()
  if (to.name === 'login') {
    // 已双登录则直接进主页；已登录 relay 未登录 pixiv 则停在 token 步骤
    if (relay.isLoggedIn && pixiv.isLoggedIn) return { name: 'home' }
    return true
  }
  if (!relay.isLoggedIn) return { name: 'login' }
  if (!pixiv.isLoggedIn) return { name: 'login', query: { step: 'pixiv' } }
  return true
})
