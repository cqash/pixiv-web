<script setup lang="ts">
// 搜索页：关键词 + 补全下拉 + 插画/用户切换 + 热门标签网格
// 插画结果走 IllustWaterfall；用户结果为单列 UserPreview 列表（同样 IntersectionObserver 分页）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchAutocomplete,
  fetchNext,
  fetchTrendingTags,
  searchIllust,
  searchUser,
} from '../../api/pixiv'
import type { AutocompleteTag, TrendingTag, UserListPage, UserPreview } from '../../api/types'
import type { SearchOptions } from '../../api/pixiv'
import { useSettingsStore } from '../../stores/settings'
import { useHistoryStore } from '../../stores/history'
import IllustWaterfall from '../../components/IllustWaterfall.vue'
import CachedImage from '../../components/CachedImage.vue'
import LoadingView from '../../components/CommonViews/LoadingView.vue'
import ErrorView from '../../components/CommonViews/ErrorView.vue'
import EmptyView from '../../components/CommonViews/EmptyView.vue'

const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()
const historyStore = useHistoryStore()

// ---- 搜索条件 ----
const keyword = ref('')
const searchType = ref<'illust' | 'user'>('illust')
const sort = ref<NonNullable<SearchOptions['sort']>>('date_desc')
const searchTarget = ref<NonNullable<SearchOptions['searchTarget']>>('partial_match_for_tags')

/** 已提交搜索的关键词（输入框内容只有点搜索/补全/标签后才生效） */
const submittedWord = ref('')
const reloadToken = ref(0)

const fetchFirstIllust = computed(
  () => () =>
    searchIllust(submittedWord.value, { sort: sort.value, searchTarget: searchTarget.value }),
)

function submitSearch(word?: string) {
  const w = (word ?? keyword.value).trim()
  if (!w) return
  keyword.value = w
  autocomplete.value = []
  autocompleteOpen.value = false
  submittedWord.value = w
  reloadToken.value++
  if (searchType.value === 'user') void searchUsersFirst()
  else historyStore.addSearchHistory(w) // 插画搜索计入搜索历史
}

function switchType(t: 'illust' | 'user') {
  if (searchType.value === t) return
  searchType.value = t
  if (submittedWord.value) submitSearch()
}

// ---- 支持 ?word= 进入即搜索（详情页标签云跳转过来） ----
function applyQueryWord() {
  const w = typeof route.query.word === 'string' ? route.query.word.trim() : ''
  if (w && w !== submittedWord.value) submitSearch(w)
}

onMounted(applyQueryWord)
watch(() => route.query.word, applyQueryWord)

// ---- 补全下拉（停顿 300ms） ----
const autocomplete = ref<AutocompleteTag[]>([])
const autocompleteOpen = ref(false)
let autocompleteTimer: ReturnType<typeof setTimeout> | null = null

watch(keyword, (w) => {
  if (autocompleteTimer) clearTimeout(autocompleteTimer)
  const word = w.trim()
  if (!word || word === submittedWord.value) {
    autocomplete.value = []
    autocompleteOpen.value = false
    return
  }
  autocompleteTimer = setTimeout(async () => {
    try {
      const res = await fetchAutocomplete(word)
      if (keyword.value.trim() !== word) return // 输入已变，丢弃旧结果
      autocomplete.value = res.tags ?? []
      autocompleteOpen.value = autocomplete.value.length > 0
    } catch (e) {
      console.error('补全失败', e)
    }
  }, 300)
})

onBeforeUnmount(() => {
  if (autocompleteTimer) clearTimeout(autocompleteTimer)
})

// ---- 热门标签 ----
const trendTags = ref<TrendingTag[]>([])
onMounted(async () => {
  try {
    const res = await fetchTrendingTags()
    trendTags.value = res.trend_tags ?? []
  } catch (e) {
    console.error('热门标签加载失败', e)
  }
})

// ---- 用户搜索结果（自管分页） ----
const userItems = ref<UserPreview[]>([])
const userNextUrl = ref<string | null>(null)
const userLoading = ref(false)
const userLoadingMore = ref(false)
const userError = ref('')
const userLoaded = ref(false)
const userSentinel = ref<HTMLElement | null>(null)
let userObserver: IntersectionObserver | null = null

async function searchUsersFirst() {
  userLoading.value = true
  userError.value = ''
  try {
    const page = await searchUser(submittedWord.value)
    userItems.value = filterMutedUsers(page.user_previews ?? [])
    userNextUrl.value = page.next_url
    userLoaded.value = true
  } catch (e) {
    userError.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    userLoading.value = false
  }
}

async function searchUsersMore() {
  if (!userNextUrl.value || userLoadingMore.value || userLoading.value) return
  userLoadingMore.value = true
  try {
    const page = await fetchNext<UserListPage>(userNextUrl.value)
    const seen = new Set(userItems.value.map((p) => p.user.id))
    const fresh = filterMutedUsers(page.user_previews ?? []).filter(
      (p) => !seen.has(p.user.id),
    )
    userItems.value = [...userItems.value, ...fresh]
    userNextUrl.value = page.next_url
  } catch (e) {
    console.error('用户搜索分页失败', e)
  } finally {
    userLoadingMore.value = false
  }
}

function filterMutedUsers(previews: UserPreview[]): UserPreview[] {
  const muted = settingsStore.settings.muteUsers
  if (muted.length === 0) return previews
  return previews.filter((p) => !muted.includes(p.user.id))
}

onMounted(() => {
  userObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((en) => en.isIntersecting)) void searchUsersMore()
    },
    { rootMargin: '400px' },
  )
  if (userSentinel.value) userObserver.observe(userSentinel.value)
})

// sentinel 在首次搜索完成后才渲染，需随 ref 变化挂/摘观察
watch(userSentinel, (el, old) => {
  if (old) userObserver?.unobserve(old)
  if (el) userObserver?.observe(el)
})

onBeforeUnmount(() => {
  userObserver?.disconnect()
  userObserver = null
})

function openUser(userId: number) {
  router.push({ name: 'user-profile', params: { id: userId } })
}
</script>

<template>
  <div>
    <!-- 搜索框 + 补全 -->
    <div class="search-bar">
      <div class="input-wrap">
        <input
          v-model="keyword"
          type="text"
          placeholder="搜索插画或用户"
          @keyup.enter="submitSearch()"
          @focus="autocompleteOpen = autocomplete.length > 0"
        />
        <ul v-if="autocompleteOpen" class="autocomplete">
          <li
            v-for="tag in autocomplete"
            :key="tag.name"
            class="autocomplete-item"
            @click="submitSearch(tag.name)"
          >
            <span class="tag-name">{{ tag.name }}</span>
            <span v-if="tag.translated_name" class="tag-trans">{{ tag.translated_name }}</span>
          </li>
        </ul>
      </div>
      <button class="search-btn" @click="submitSearch()">搜索</button>
    </div>

    <!-- 类型 + 插画搜索选项 -->
    <div class="option-bar">
      <div class="type-switch">
        <button
          class="switch-btn"
          :class="{ active: searchType === 'illust' }"
          @click="switchType('illust')"
        >
          插画
        </button>
        <button
          class="switch-btn"
          :class="{ active: searchType === 'user' }"
          @click="switchType('user')"
        >
          用户
        </button>
      </div>
      <template v-if="searchType === 'illust'">
        <select v-model="sort" class="option-select" @change="submittedWord && submitSearch()">
          <option value="date_desc">最新</option>
          <option value="date_asc">最早</option>
          <option value="popular_desc">人气</option>
        </select>
        <select
          v-model="searchTarget"
          class="option-select"
          @change="submittedWord && submitSearch()"
        >
          <option value="partial_match_for_tags">标签部分一致</option>
          <option value="exact_match_for_tags">标签完全一致</option>
          <option value="title_and_caption">标题・说明</option>
        </select>
      </template>
    </div>

    <!-- 未搜索时：热门标签 -->
    <div v-if="!submittedWord" class="trend-section">
      <h3 class="trend-title">热门标签</h3>
      <div class="trend-grid">
        <div
          v-for="t in trendTags"
          :key="t.tag"
          class="trend-cell"
          @click="submitSearch(t.tag)"
        >
          <CachedImage :src="t.illust.image_urls.square_medium ?? ''" :ratio="1" :alt="t.tag" />
          <div class="trend-label">
            <p class="trend-tag">#{{ t.tag }}</p>
            <p v-if="t.translated_name" class="trend-trans">{{ t.translated_name }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 插画结果 -->
    <IllustWaterfall
      v-else-if="searchType === 'illust'"
      :fetch-first="fetchFirstIllust"
      :reload-token="reloadToken"
    />

    <!-- 用户结果 -->
    <div v-else>
      <LoadingView v-if="userLoading && !userLoaded" />
      <ErrorView
        v-else-if="userError && !userLoaded"
        :message="userError"
        @retry="searchUsersFirst"
      />
      <template v-else>
        <EmptyView v-if="userLoaded && userItems.length === 0" text="未找到相关用户" />
        <div class="user-list">
          <div
            v-for="preview in userItems"
            :key="preview.user.id"
            class="user-cell"
            @click="openUser(preview.user.id)"
          >
            <div class="avatar">
              <CachedImage
                :src="preview.user.profile_image_urls.px_50x50 ?? ''"
                :ratio="1"
                :alt="preview.user.name"
              />
            </div>
            <div class="user-info">
              <p class="user-name">{{ preview.user.name }}</p>
              <p class="user-account">@{{ preview.user.account }}</p>
            </div>
            <div class="user-works">
              <div v-for="illust in preview.illusts.slice(0, 3)" :key="illust.id" class="work">
                <CachedImage
                  :src="illust.image_urls.square_medium ?? ''"
                  :ratio="1"
                  :alt="illust.title"
                />
              </div>
            </div>
          </div>
        </div>
        <div ref="userSentinel" class="sentinel" />
        <p v-if="userLoadingMore" class="foot">加载中…</p>
        <p v-else-if="userLoaded && !userNextUrl && userItems.length > 0" class="foot">
          没有更多了
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.input-wrap {
  position: relative;
  flex: 1;
}
.autocomplete {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  max-height: 320px;
  overflow-y: auto;
}
.autocomplete-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.autocomplete-item:hover {
  background: var(--bg);
}
.tag-trans {
  font-size: 12px;
  color: var(--text-secondary);
}
.search-btn {
  flex-shrink: 0;
}
.option-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.type-switch {
  display: flex;
  gap: 8px;
}
.switch-btn {
  padding: 4px 14px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.switch-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
.option-select {
  width: auto;
  flex: 0 1 180px;
}
.trend-title {
  margin: 0 0 8px;
  font-size: 15px;
}
.trend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.trend-cell {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.trend-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px 8px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  color: #fff;
}
.trend-tag {
  margin: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trend-trans {
  margin: 0;
  font-size: 11px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  cursor: pointer;
}
.avatar {
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
}
.user-info {
  min-width: 0;
  flex-shrink: 0;
}
.user-name {
  margin: 0;
  font-size: 14px;
}
.user-account {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.user-works {
  display: flex;
  gap: 8px;
  margin-left: auto;
  overflow: hidden;
}
.work {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: var(--radius);
  overflow: hidden;
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
@media (max-width: 767px) {
  .work {
    width: 56px;
    height: 56px;
  }
}
</style>
