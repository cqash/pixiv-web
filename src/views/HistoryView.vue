<script setup lang="ts">
// 历史记录页：浏览历史（网格 + 导出/清空）/ 搜索历史（关键词列表 + 清空）
// 条目均为真实 <a> 链接（RouterLink）：支持中键/Ctrl+点击/右键新标签页打开（同 IllustCard）
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHistoryStore } from '../stores/history'
import { formatCreateDate } from '../utils/date'
import CachedImage from '../components/CachedImage.vue'
import EmptyView from '../components/CommonViews/EmptyView.vue'

const router = useRouter()
const historyStore = useHistoryStore()

const activeTab = ref<'browse' | 'search'>('browse')

// ---- 导出 ----
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportJson() {
  const items = historyStore.browse
  if (items.length === 0) return
  const data = {
    version: 1,
    appName: 'pixiv-web',
    type: 'history',
    exportedAt: new Date().toISOString(),
    count: items.length,
    items,
  }
  downloadFile('arkpix-history.json', JSON.stringify(data, null, 2), 'application/json')
}

function exportPids() {
  const items = historyStore.browse
  if (items.length === 0) return
  downloadFile('arkpix-history-pids.txt', items.map((i) => i.illustId).join('\n'), 'text/plain')
}

function clearBrowse() {
  if (confirm('确定清空全部浏览历史？')) historyStore.clearBrowseHistory()
}

function clearSearch() {
  if (confirm('确定清空全部搜索历史？')) historyStore.clearSearchHistory()
}
</script>

<template>
  <div class="history-page">
    <div class="header">
      <button class="secondary back-btn" @click="router.back()">← 返回</button>
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'browse' }"
          @click="activeTab = 'browse'"
        >
          浏览历史
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'search' }"
          @click="activeTab = 'search'"
        >
          搜索历史
        </button>
      </div>
      <div class="menu">
        <template v-if="activeTab === 'browse'">
          <button
            class="secondary menu-btn"
            :disabled="historyStore.browse.length === 0"
            @click="exportJson"
          >
            导出 JSON
          </button>
          <button
            class="secondary menu-btn"
            :disabled="historyStore.browse.length === 0"
            @click="exportPids"
          >
            导出 PID 列表
          </button>
          <button
            class="secondary menu-btn danger"
            :disabled="historyStore.browse.length === 0"
            @click="clearBrowse"
          >
            清空
          </button>
        </template>
        <button
          v-else
          class="secondary menu-btn danger"
          :disabled="historyStore.search.length === 0"
          @click="clearSearch"
        >
          清空
        </button>
      </div>
    </div>

    <!-- 浏览历史 -->
    <template v-if="activeTab === 'browse'">
      <EmptyView v-if="historyStore.browse.length === 0" text="暂无浏览历史" />
      <div v-else class="grid">
        <RouterLink
          v-for="item in historyStore.browse"
          :key="item.illustId"
          :to="{ name: 'illust-detail', params: { id: item.illustId } }"
          class="cell"
        >
          <div class="thumb">
            <CachedImage :src="item.imageUrl" :ratio="1" :alt="item.title" />
          </div>
          <p class="cell-title">{{ item.title }}</p>
          <p class="cell-meta">{{ item.userName }}</p>
          <p class="cell-meta">{{ formatCreateDate(new Date(item.timestamp).toISOString()) }}</p>
        </RouterLink>
      </div>
    </template>

    <!-- 搜索历史 -->
    <template v-else>
      <EmptyView v-if="historyStore.search.length === 0" text="暂无搜索历史" />
      <div v-else class="search-list">
        <RouterLink
          v-for="item in historyStore.search"
          :key="`${item.searchType}:${item.keyword}`"
          :to="{ name: 'search', query: { word: item.keyword } }"
          class="search-item"
        >
          <span class="keyword">{{ item.keyword }}</span>
          <span class="search-time">{{ formatCreateDate(new Date(item.timestamp).toISOString()) }}</span>
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.history-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.back-btn {
  flex-shrink: 0;
}
.tabs {
  display: flex;
  gap: 8px;
  flex: 1;
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
.menu {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.menu-btn {
  padding: 4px 12px;
  font-size: 12px;
}
.menu-btn.danger:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.cell {
  display: block;
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  cursor: pointer;
  padding-bottom: 8px;
  color: inherit;
  text-decoration: none;
}
.cell-title {
  margin: 8px 8px 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-meta {
  margin: 2px 8px 0;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.keyword {
  font-size: 14px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}
@media (max-width: 767px) {
  .history-page {
    padding: 8px;
  }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}
</style>
