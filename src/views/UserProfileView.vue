<script setup lang="ts">
// 用户主页：资料卡（头像/名字/简介/统计 + 关注按钮）+ 插画/漫画/收藏 三个瀑布流 Tab
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchUserBookmarks,
  fetchUserDetail,
  fetchUserIllusts,
  followAdd,
  followDelete,
} from '../api/pixiv'
import type { UserDetail } from '../api/types'
import { usePixivAuthStore } from '../stores/pixivAuth'
import IllustWaterfall from '../components/IllustWaterfall.vue'
import CachedImage from '../components/CachedImage.vue'
import LoadingView from '../components/CommonViews/LoadingView.vue'
import ErrorView from '../components/CommonViews/ErrorView.vue'

const route = useRoute()
const router = useRouter()
const pixivAuth = usePixivAuthStore()

// ---- 用户资料（三态） ----
const detail = ref<UserDetail | null>(null)
const loading = ref(false)
const error = ref('')

// ---- 关注（本地态，失败回滚） ----
const followed = ref(false)
const followLoading = ref(false)

// ---- Tabs ----
type TabKey = 'illust' | 'manga' | 'bookmark'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'illust', label: '插画' },
  { key: 'manga', label: '漫画' },
  { key: 'bookmark', label: 'TA 的收藏' },
]
const activeTab = ref<TabKey>('illust')
const reloadToken = ref(0)

const userId = computed(() => String(route.params.id ?? ''))
const isSelf = computed(() => !!pixivAuth.user && String(pixivAuth.user.id) === userId.value)

const fetchFirst = computed(() => {
  const id = userId.value
  switch (activeTab.value) {
    case 'manga':
      return () => fetchUserIllusts(id, 'manga')
    case 'bookmark':
      return () => fetchUserBookmarks(id, 'public')
    default:
      return () => fetchUserIllusts(id, 'illust')
  }
})

// 统计行：仅展示接口返回了的项
const stats = computed(() => {
  const p = detail.value?.profile
  if (!p) return [] as { label: string; value: number }[]
  const all: { label: string; value: number | undefined }[] = [
    { label: '关注', value: p.total_follow_users },
    { label: '插画', value: p.total_illusts },
    { label: '漫画', value: p.total_manga },
    { label: '公开收藏', value: p.total_illust_bookmarks_public },
  ]
  return all.filter((s): s is { label: string; value: number } => s.value !== undefined)
})

async function load() {
  const id = userId.value
  if (!id) return
  loading.value = true
  error.value = ''
  detail.value = null
  window.scrollTo(0, 0)
  try {
    const res = await fetchUserDetail(id)
    if (id !== userId.value) return // 加载期间已切换路由
    detail.value = res
    followed.value = !!res.user.is_followed
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (id === userId.value) loading.value = false
  }
}

// 路由参数变化（用户页间跳转）→ 重新加载资料并复位 Tab
watch(
  userId,
  (id, old) => {
    if (id && id !== old) {
      activeTab.value = 'illust'
      reloadToken.value++
      void load()
    }
  },
  { immediate: true },
)

function switchTab(tab: TabKey) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  reloadToken.value++
}

async function onToggleFollow() {
  const d = detail.value
  if (!d || followLoading.value) return
  followLoading.value = true
  const prevState = followed.value
  followed.value = !prevState
  try {
    if (followed.value) await followAdd(d.user.id)
    else await followDelete(d.user.id)
  } catch (e) {
    followed.value = prevState // 回滚
    console.error('关注操作失败', e)
  } finally {
    followLoading.value = false
  }
}
</script>

<template>
  <div class="profile-page">
    <button class="secondary back-btn" @click="router.back()">← 返回</button>

    <LoadingView v-if="loading && !detail" />
    <ErrorView v-else-if="error && !detail" :message="error" @retry="load" />

    <template v-else-if="detail">
      <!-- 资料卡 -->
      <div class="profile-card">
        <div class="profile-main">
          <div class="avatar">
            <CachedImage
              :src="detail.user.profile_image_urls.px_170x170 ?? detail.user.profile_image_urls.medium ?? ''"
              :ratio="1"
              :alt="detail.user.name"
            />
          </div>
          <div class="identity">
            <h1 class="name">{{ detail.user.name }}</h1>
            <p class="account">@{{ detail.user.account }}</p>
          </div>
          <button
            v-if="!isSelf"
            class="follow-btn"
            :class="{ followed }"
            :disabled="followLoading"
            @click="onToggleFollow"
          >
            {{ followed ? '已关注' : '关注' }}
          </button>
        </div>
        <p v-if="detail.user.comment" class="bio">{{ detail.user.comment }}</p>
        <div v-if="stats.length" class="stats">
          <span v-for="s in stats" :key="s.label" class="stat">
            <b>{{ s.value }}</b> {{ s.label }}
          </span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 列表（收藏 tab 无权限时由瀑布流自身 ErrorView 呈现） -->
      <IllustWaterfall
        :fetch-first="fetchFirst"
        :reload-token="reloadToken"
        :cache-key="`user-${userId}`"
      />
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}
.back-btn {
  margin-bottom: 12px;
}
.profile-card {
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.profile-main {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
}
.identity {
  min-width: 0;
  flex: 1;
}
.name {
  margin: 0;
  font-size: 18px;
  line-height: 1.4;
}
.account {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.follow-btn {
  flex-shrink: 0;
  padding: 8px 20px;
  font-size: 13px;
}
.follow-btn.followed {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.bio {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.stat b {
  color: var(--text);
}
.tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0 12px;
}
.tab-btn {
  padding: 6px 18px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.tab-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
@media (max-width: 767px) {
  .profile-page {
    padding: 8px;
  }
  .avatar {
    width: 64px;
    height: 64px;
  }
}
</style>
