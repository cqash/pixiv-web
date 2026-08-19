<script setup lang="ts">
// 作品详情页：多页图片 + 标题/作者/关注 + caption + 标签云 + 统计 + 收藏/下载 + 相关作品
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchIllustDetail, fetchRelated, followAdd, followDelete } from '../api/pixiv'
import { loadImage, releaseImage } from '../api/image'
import type { Illust } from '../api/types'
import { imageExt, pickDetailUrl } from '../utils/imageQuality'
import { formatCreateDate } from '../utils/date'
import { useSettingsStore } from '../stores/settings'
import { useBookmarkStore } from '../stores/bookmarks'
import { useHistoryStore } from '../stores/history'
import CachedImage from '../components/CachedImage.vue'
import IllustCard from '../components/IllustCard.vue'
import ImageViewer from '../components/ImageViewer.vue'
import LoadingView from '../components/CommonViews/LoadingView.vue'
import ErrorView from '../components/CommonViews/ErrorView.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()
const historyStore = useHistoryStore()

// ---- 详情加载（三态） ----
const illust = ref<Illust | null>(null)
const loading = ref(false)
const error = ref('')

// ---- 相关作品 ----
const related = ref<Illust[]>([])
const relatedLoading = ref(false)

// ---- 防社死遮罩（按页单向揭示） ----
const revealedPages = ref<number[]>([])

// ---- 查看器 ----
const viewerOpen = ref(false)
const viewerInitial = ref(0)

// ---- 关注（本地态，失败回滚） ----
const followed = ref(false)
const followLoading = ref(false)

// ---- 下载 ----
const downloading = ref(false)

// ---- toast ----
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2000)
}

const illustId = computed(() => String(route.params.id ?? ''))

const pages = computed(() => {
  const i = illust.value
  if (!i) return [] as number[]
  return Array.from({ length: Math.max(1, i.page_count) }, (_, k) => k)
})

const pageRatio = computed(() => {
  const i = illust.value
  if (!i || i.width <= 0 || i.height <= 0) return 0
  return i.width / i.height
})

const maskedAll = computed(
  () =>
    settingsStore.settings.antiSocialDeath &&
    !!illust.value &&
    illust.value.x_restrict > 0,
)
function isMasked(page: number): boolean {
  return maskedAll.value && !revealedPages.value.includes(page)
}
function reveal(page: number) {
  if (!revealedPages.value.includes(page)) {
    revealedPages.value = [...revealedPages.value, page]
  }
}

const bookmarkState = computed(() =>
  illust.value ? bookmarkStore.stateOf(illust.value.id) : 0,
)

/** caption 最小消毒：剔除危险标签及其内容、on* 事件属性 */
function sanitizeCaption(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
    }
  })
  return doc.body.innerHTML
}

const safeCaption = computed(() => {
  const c = illust.value?.caption
  return c ? sanitizeCaption(c) : ''
})

async function load() {
  const id = illustId.value
  if (!id) return
  loading.value = true
  error.value = ''
  illust.value = null
  related.value = []
  revealedPages.value = []
  viewerOpen.value = false
  downloading.value = false
  window.scrollTo(0, 0)
  try {
    const res = await fetchIllustDetail(id)
    if (id !== illustId.value) return // 加载期间已切换路由
    illust.value = res.illust
    bookmarkStore.setState(res.illust.id, res.illust.is_bookmarked ? 2 : 0)
    followed.value = !!res.illust.user.is_followed
    historyStore.addHistory(res.illust)
    void loadRelated(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (id === illustId.value) loading.value = false
  }
}

async function loadRelated(id: string) {
  relatedLoading.value = true
  try {
    const res = await fetchRelated(id)
    if (id !== illustId.value) return
    related.value = res.illusts ?? []
    bookmarkStore.seedFromList(related.value)
  } catch (e) {
    console.error('相关作品加载失败', e)
  } finally {
    if (id === illustId.value) relatedLoading.value = false
  }
}

// 同路由参数变化（点相关作品跳转）→ 重新加载并重置状态
watch(illustId, (id, old) => {
  if (id && id !== old) void load()
}, { immediate: true })

// ---- 交互 ----
function openViewer(page: number) {
  viewerInitial.value = page
  viewerOpen.value = true
}

function openUser() {
  if (illust.value) {
    router.push({ name: 'user-profile', params: { id: illust.value.user.id } })
  }
}

async function onToggleFollow() {
  const i = illust.value
  if (!i || followLoading.value) return
  followLoading.value = true
  const prevState = followed.value
  followed.value = !prevState
  try {
    if (followed.value) await followAdd(i.user.id)
    else await followDelete(i.user.id)
  } catch (e) {
    followed.value = prevState // 回滚
    console.error('关注操作失败', e)
    showToast('操作失败，请重试')
  } finally {
    followLoading.value = false
  }
}

async function onToggleBookmark() {
  const i = illust.value
  if (!i) return
  try {
    await bookmarkStore.toggle(i.id) // 默认公开收藏
  } catch (e) {
    console.error('收藏操作失败', e) // store 已回滚状态
    showToast('收藏操作失败')
  }
}

function openTag(name: string) {
  router.push({ name: 'search', query: { word: name } })
}

function openComments() {
  if (illust.value) {
    router.push({
      name: 'comments',
      params: { id: illust.value.id },
      query: { title: illust.value.title },
    })
  }
}

function muteAuthor() {
  const i = illust.value
  if (!i) return
  if (!confirm(`确定屏蔽作者「${i.user.name}」？其作品将不再出现在列表中。`)) return
  settingsStore.addMuteUser(i.user.id)
  showToast('已屏蔽该作者')
}

async function copyPid() {
  const i = illust.value
  if (!i) return
  try {
    await navigator.clipboard.writeText(String(i.id))
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

async function downloadPage(page: number): Promise<void> {
  const i = illust.value
  if (!i) return
  const url = pickDetailUrl(i, page, settingsStore.settings.detailQuality)
  try {
    const objectUrl = await loadImage(url)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${i.id}_p${page}.${imageExt(url)}`
    a.click()
  } finally {
    releaseImage(url)
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function onDownload() {
  const i = illust.value
  if (!i || downloading.value) return
  downloading.value = true
  try {
    for (const p of pages.value) {
      try {
        await downloadPage(p)
      } catch (e) {
        console.error(`第 ${p + 1} 页下载失败`, e)
        showToast(`第 ${p + 1} 页下载失败`)
      }
      if (pages.value.length > 1) await sleep(300) // 多页顺序下载，防限流
    }
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="detail-page">
    <button class="secondary back-btn" @click="router.back()">← 返回</button>

    <LoadingView v-if="loading && !illust" />
    <ErrorView v-else-if="error && !illust" :message="error" @retry="load" />

    <template v-else-if="illust">
      <!-- 图片区 -->
      <div class="pages">
        <div v-for="p in pages" :key="p" class="page-item" @click="openViewer(p)">
          <CachedImage
            :src="pickDetailUrl(illust, p, settingsStore.settings.detailQuality)"
            :ratio="pageRatio"
            fit="contain"
            :alt="`${illust.title} p${p}`"
            class="page-image"
          />
          <div v-if="isMasked(p)" class="r18-mask" @click.stop="reveal(p)">🔒</div>
        </div>
      </div>

      <!-- 信息区 -->
      <div class="info-card">
        <h1 class="title">{{ illust.title }}</h1>

        <div class="author-row">
          <div class="author" @click="openUser">
            <div class="avatar">
              <CachedImage
                :src="illust.user.profile_image_urls.medium ?? ''"
                :ratio="1"
                :alt="illust.user.name"
              />
            </div>
            <span class="author-name">{{ illust.user.name }}</span>
            <button class="mute-author-btn" title="屏蔽该作者" @click.stop="muteAuthor">
              屏蔽
            </button>
          </div>
          <button
            class="follow-btn"
            :class="{ followed }"
            :disabled="followLoading"
            @click="onToggleFollow"
          >
            {{ followed ? '已关注' : '关注' }}
          </button>
        </div>

        <div v-if="safeCaption" class="caption" v-html="safeCaption" />

        <div v-if="illust.tags.length" class="tags">
          <button
            v-for="tag in illust.tags"
            :key="tag.name"
            class="tag-chip"
            @click="openTag(tag.name)"
          >
            #{{ tag.name
            }}<span v-if="tag.translated_name" class="tag-trans">（{{ tag.translated_name }}）</span>
          </button>
        </div>

        <div class="stats">
          <span>浏览 {{ illust.total_view }}</span>
          <span>收藏 {{ illust.total_bookmarks }}</span>
          <span>{{ formatCreateDate(illust.create_date) }}</span>
          <button class="pid" title="点击复制" @click="copyPid">PID: {{ illust.id }}</button>
        </div>
      </div>

      <!-- 操作区 -->
      <div class="actions">
        <button
          class="action-btn bookmark-btn"
          :class="{ active: bookmarkState === 2 }"
          :disabled="bookmarkState === 1"
          @click="onToggleBookmark"
        >
          {{ bookmarkState === 2 ? '❤ 已收藏' : '♡ 收藏' }}
        </button>
        <button class="action-btn secondary" :disabled="downloading" @click="onDownload">
          {{ downloading ? '下载中…' : illust.page_count > 1 ? `下载全部（${illust.page_count}P）` : '下载' }}
        </button>
        <button class="action-btn secondary" @click="openComments">查看评论</button>
      </div>

      <!-- 相关作品 -->
      <section v-if="related.length || relatedLoading" class="related">
        <h2 class="related-title">相关作品</h2>
        <LoadingView v-if="relatedLoading && related.length === 0" text="相关作品加载中…" />
        <div class="related-grid">
          <IllustCard v-for="r in related" :key="r.id" :illust="r" />
        </div>
      </section>
    </template>

    <ImageViewer
      v-if="viewerOpen && illust"
      :illust="illust"
      :initial-index="viewerInitial"
      @close="viewerOpen = false"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}
.back-btn {
  margin-bottom: 12px;
}
.pages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.page-item {
  position: relative;
  cursor: zoom-in;
  background: #111;
  border-radius: var(--radius);
  overflow: hidden;
}
.r18-mask {
  position: absolute;
  inset: 0;
  background: var(--mask-r18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  cursor: pointer;
}
.info-card {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.title {
  margin: 0 0 12px;
  font-size: 20px;
  line-height: 1.4;
}
.author-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.author {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}
.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
}
.author-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mute-author-btn {
  padding: 0 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  flex-shrink: 0;
}
.mute-author-btn:hover {
  color: var(--accent-danger);
}
.follow-btn {
  flex-shrink: 0;
  padding: 6px 18px;
  font-size: 13px;
}
.follow-btn.followed {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.caption {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  word-break: break-word;
  overflow-wrap: anywhere;
}
.caption :deep(a) {
  word-break: break-all;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.tag-chip {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg);
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.tag-trans {
  color: var(--text-secondary);
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}
.pid {
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
}
.pid:hover {
  color: var(--accent);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  position: sticky;
  bottom: 8px;
}
.action-btn {
  flex: 1;
  padding: 10px 12px;
  font-size: 14px;
  white-space: nowrap;
}
.bookmark-btn {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}
.bookmark-btn.active {
  color: #ff4081;
  border-color: #ff4081;
}
.related {
  margin-top: 20px;
}
.related-title {
  margin: 0 0 12px;
  font-size: 16px;
}
.related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 13px;
  z-index: 1100;
}
@media (max-width: 767px) {
  .detail-page {
    padding: 8px;
    max-width: none;
  }
  .title {
    font-size: 17px;
  }
  .actions {
    flex-wrap: wrap;
  }
}
</style>
