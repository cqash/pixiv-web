<script setup lang="ts">
// 插画瀑布流容器：首载 + IntersectionObserver 游标分页 + 屏蔽过滤 + 收藏播种
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Illust, IllustListPage } from '../api/types'
import { fetchNext } from '../api/pixiv'
import { filterMuted } from '../utils/mute'
import { useSettingsStore } from '../stores/settings'
import { useBookmarkStore } from '../stores/bookmarks'
import IllustCard from './IllustCard.vue'
import LoadingView from './CommonViews/LoadingView.vue'
import ErrorView from './CommonViews/ErrorView.vue'
import EmptyView from './CommonViews/EmptyView.vue'
import {
  clearWaterfallSnapshot,
  loadWaterfallSnapshot,
  saveWaterfallSnapshot,
} from './waterfallCache'

const props = defineProps<{
  fetchFirst: () => Promise<IllustListPage>
  reloadToken?: number | string
  /** 提供时跨组件生命周期缓存列表状态（内存级），返回上级页面不重拉 */
  cacheKey?: string
}>()

const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()

const items = ref<Illust[]>([])
const nextUrl = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const loaded = ref(false)

function saveSnapshot() {
  if (props.cacheKey) {
    saveWaterfallSnapshot(props.cacheKey, { items: items.value, nextUrl: nextUrl.value })
  }
}

/** 尝试从模块级缓存恢复；命中返回 true */
function restoreSnapshot(): boolean {
  if (!props.cacheKey) return false
  const snap = loadWaterfallSnapshot(props.cacheKey)
  if (!snap || snap.items.length === 0) return false
  items.value = snap.items
  nextUrl.value = snap.nextUrl
  rebuildColumns()
  loaded.value = true
  return true
}

// ---- 分列渲染：条目在入库时按"最短列"分配列归属，追加不打乱已有卡片 ----
// 仅在列数变化（响应式断点切换）时才整体重排
const columnCount = ref(computeColumnCount())
const columnItems = ref<Illust[][]>(Array.from({ length: columnCount.value }, () => []))
let columnLoads: number[] = new Array(columnCount.value).fill(0)

function computeColumnCount(): number {
  const w = window.innerWidth
  if (w >= 1400) return 5
  if (w >= 1024) return 4
  if (w >= 768) return 3
  return 2
}

function effectiveAspect(i: Illust): number {
  // 与 IllustCard 的占坑规则一致：高/宽 > 3 降级方图
  const r = i.width > 0 && i.height > 0 ? i.height / i.width : 1
  return Math.min(r, 3)
}

function estimateLoad(i: Illust): number {
  // 以"图片高宽比 + 信息区折算"估算卡片相对高度，用于选最短列
  const containerW = Math.min(1400, window.innerWidth) - 32
  const colW = Math.max(80, (containerW - (columnCount.value - 1) * 12) / columnCount.value)
  return effectiveAspect(i) + 64 / colW
}

function assignItems(newItems: Illust[]) {
  for (const item of newItems) {
    let minIdx = 0
    for (let c = 1; c < columnLoads.length; c++) {
      if (columnLoads[c] < columnLoads[minIdx]) minIdx = c
    }
    columnItems.value[minIdx].push(item)
    columnLoads[minIdx] += estimateLoad(item)
  }
}

function rebuildColumns() {
  columnItems.value = Array.from({ length: columnCount.value }, () => [])
  columnLoads = new Array(columnCount.value).fill(0)
  assignItems(items.value)
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    const next = computeColumnCount()
    if (next !== columnCount.value) {
      columnCount.value = next
      rebuildColumns()
    }
  }, 150)
}

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function ingest(page: IllustListPage): Illust[] {
  bookmarkStore.seedFromList(page.illusts)
  return filterMuted(page.illusts, settingsStore.settings)
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : '加载失败'
}

async function loadFirst() {
  loading.value = true
  error.value = ''
  try {
    const page = await props.fetchFirst()
    items.value = ingest(page)
    rebuildColumns()
    nextUrl.value = page.next_url
    loaded.value = true
    saveSnapshot()
  } catch (e) {
    error.value = errText(e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextUrl.value || loadingMore.value || loading.value) return
  loadingMore.value = true
  try {
    const page = await fetchNext<IllustListPage>(nextUrl.value)
    const seen = new Set(items.value.map((i) => i.id))
    const fresh = ingest(page).filter((i) => !seen.has(i.id))
    items.value = [...items.value, ...fresh]
    assignItems(fresh) // 只追加到各列尾部，已有卡片列归属不变
    nextUrl.value = page.next_url
    saveSnapshot()
  } catch (e) {
    console.error('分页加载失败', e)
  } finally {
    loadingMore.value = false
  }
}

function resetAndReload() {
  if (props.cacheKey) clearWaterfallSnapshot(props.cacheKey)
  items.value = []
  nextUrl.value = null
  loadingMore.value = false
  loaded.value = false
  void loadFirst()
}

function refresh() {
  resetAndReload()
}

defineExpose({ refresh })

watch(
  () => props.reloadToken,
  (next, prev) => {
    if (next !== prev && prev !== undefined) resetAndReload()
  },
)

onMounted(() => {
  if (!restoreSnapshot()) void loadFirst() // 有缓存则原样恢复，不重拉
  window.addEventListener('resize', onResize)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((en) => en.isIntersecting)) void loadMore()
    },
    { rootMargin: '400px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

// sentinel 在首载完成后才渲染，需随 ref 变化挂/摘观察
watch(sentinel, (el, old) => {
  if (old) observer?.unobserve(old)
  if (el) observer?.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', onResize)
  if (resizeTimer) clearTimeout(resizeTimer)
})
</script>

<template>
  <div class="waterfall-wrap">
    <div class="toolbar">
      <button class="refresh-btn" @click="refresh">刷新</button>
    </div>

    <LoadingView v-if="loading && !loaded" />
    <ErrorView v-else-if="error && !loaded" :message="error" @retry="resetAndReload" />
    <template v-else>
      <EmptyView v-if="loaded && items.length === 0" text="暂无作品" />
      <div class="waterfall">
        <div v-for="(col, ci) in columnItems" :key="ci" class="waterfall-col">
          <div v-for="illust in col" :key="illust.id" class="waterfall-item">
            <IllustCard :illust="illust" />
          </div>
        </div>
      </div>
      <div ref="sentinel" class="sentinel" />
      <p v-if="loadingMore" class="foot">加载中…</p>
      <p v-else-if="loaded && !nextUrl && items.length > 0" class="foot">没有更多了</p>
    </template>
  </div>
</template>

<style scoped>
.waterfall-wrap {
  position: relative;
}
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.refresh-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--border);
}
.waterfall {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.waterfall-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.waterfall-item {
  margin-bottom: 12px;
}
.sentinel {
  height: 1px;
}
.foot {
  margin: 0;
  padding: 12px 0 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
