// 浏览/搜索历史：localStorage 持久化，按 id/关键词去重插头，超限截尾

import { defineStore } from 'pinia'
import type { Illust } from '../api/types'

const STORAGE_KEY = 'arkpix.web.history'
const BROWSE_LIMIT = 500
const SEARCH_LIMIT = 50

export interface BrowseHistoryItem {
  illustId: number
  title: string
  userName: string
  userId: number
  imageUrl: string // 预览图 URL（medium 或 square_medium）
  timestamp: number // Unix 毫秒
}

export interface SearchHistoryItem {
  keyword: string
  /** 搜索类型（对齐鸿蒙端 search_type：illust/user/pid/uid；Web 端目前只产生 illust） */
  searchType: string
  timestamp: number
}

interface PersistedHistory {
  browse: BrowseHistoryItem[]
  search: SearchHistoryItem[]
}

interface HistoryState extends PersistedHistory {}

function loadPersisted(): PersistedHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { browse: [], search: [] }
    const obj = JSON.parse(raw) as { browse?: BrowseHistoryItem[]; search?: Partial<SearchHistoryItem>[] }
    return {
      browse: obj.browse ?? [],
      // 兼容 M3 存量数据（无 searchType 字段，一律视为 illust 搜索）
      search: (obj.search ?? []).map((i) => ({
        keyword: i.keyword ?? '',
        searchType: i.searchType ?? 'illust',
        timestamp: i.timestamp ?? 0,
      })),
    }
  } catch {
    return { browse: [], search: [] }
  }
}

export const useHistoryStore = defineStore('history', {
  state: (): HistoryState => ({ ...loadPersisted() }),
  actions: {
    persist() {
      const data: PersistedHistory = { browse: this.browse, search: this.search }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    addHistory(illust: Illust) {
      this.browse = this.browse.filter((i) => i.illustId !== illust.id)
      this.browse.unshift({
        illustId: illust.id,
        title: illust.title,
        userName: illust.user.name,
        userId: illust.user.id,
        imageUrl: illust.image_urls.medium ?? illust.image_urls.square_medium ?? '',
        timestamp: Date.now(),
      })
      if (this.browse.length > BROWSE_LIMIT) this.browse.length = BROWSE_LIMIT
      this.persist()
    },
    addSearchHistory(keyword: string, searchType = 'illust') {
      const k = keyword.trim()
      if (!k) return
      this.search = this.search.filter((i) => !(i.keyword === k && i.searchType === searchType))
      this.search.unshift({ keyword: k, searchType, timestamp: Date.now() })
      if (this.search.length > SEARCH_LIMIT) this.search.length = SEARCH_LIMIT
      this.persist()
    },
    clearBrowseHistory() {
      this.browse = []
      this.persist()
    },
    clearSearchHistory() {
      this.search = []
      this.persist()
    },
    removeBrowseItem(illustId: number) {
      this.browse = this.browse.filter((i) => i.illustId !== illustId)
      this.persist()
    },
    // ---- 同步合并入口（services/syncService.ts 下行应用用；调用方需自行做 LWW 判定） ----
    upsertBrowseEntry(entry: BrowseHistoryItem) {
      this.browse = this.browse.filter((i) => i.illustId !== entry.illustId)
      this.browse.push(entry)
      this.browse.sort((a, b) => b.timestamp - a.timestamp)
      if (this.browse.length > BROWSE_LIMIT) this.browse.length = BROWSE_LIMIT
      this.persist()
    },
    upsertSearchEntry(keyword: string, searchType: string, timestamp: number) {
      this.search = this.search.filter(
        (i) => !(i.keyword === keyword && i.searchType === searchType),
      )
      this.search.push({ keyword, searchType, timestamp })
      this.search.sort((a, b) => b.timestamp - a.timestamp)
      if (this.search.length > SEARCH_LIMIT) this.search.length = SEARCH_LIMIT
      this.persist()
    },
    removeSearchEntry(keyword: string, searchType: string) {
      this.search = this.search.filter(
        (i) => !(i.keyword === keyword && i.searchType === searchType),
      )
      this.persist()
    },
  },
})
