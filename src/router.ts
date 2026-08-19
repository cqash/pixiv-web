// 路由：history 模式（后端 SPA fallback 到 index.html）+ 登录守卫

import { createRouter, createWebHistory } from 'vue-router'
import { useRelayAuthStore } from './stores/relayAuth'
import { usePixivAuthStore } from './stores/pixivAuth'

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
  ],
})

router.beforeEach((to) => {
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
