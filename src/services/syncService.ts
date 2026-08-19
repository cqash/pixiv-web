// 数据同步调度：settings / mute / history / search_history 四域上行下行合并（普通模块，非 pinia）
// 结构对齐鸿蒙端 SyncService.ets（跨端同步同一账号），协议见 backend-design.md §7
// bookmark_snapshot 域 Web 端不做（只读场景少）；exif_config 为鸿蒙端专属
//
// 关键机制：
// - store $subscribe（flush:'sync'）diff 出删除墓碑 + 本地写时间戳，2s 防抖自动 syncNow
// - applyingRemote：下行应用期间抑制订阅回传，防回声循环
// - 409 SYNC_FULL_REQUIRED：清该域游标后全量 pull 重建（本地多余条目随后续 push 自然补回）

import {
  SyncFullRequiredError,
  getSyncToken,
  pullDomain,
  pushDomain,
  setSyncToken,
} from '../api/sync'
import type { SyncEntry } from '../api/types'
import { useHistoryStore } from '../stores/history'
import { useRelayAuthStore } from '../stores/relayAuth'
import { useSettingsStore, type AppSettings } from '../stores/settings'

// ---------------- 同步域（对齐鸿蒙端） ----------------

const DOMAIN_HISTORY = 'history'
const DOMAIN_SEARCH_HISTORY = 'search_history'
const DOMAIN_MUTE = 'mute'
const DOMAIN_SETTINGS = 'settings'

const DOMAINS = [DOMAIN_SETTINGS, DOMAIN_MUTE, DOMAIN_HISTORY, DOMAIN_SEARCH_HISTORY] as const

const SYNC_DEBOUNCE_MS = 2000

// ---------------- 远端 data 结构（对齐鸿蒙端 SyncService.ets） ----------------

/** history 域 data：key = String(illustId) */
interface RemoteHistoryData {
  title?: string
  imageUrl?: string
  userName?: string
  viewedAt?: number
}

/** search_history 域 data：key = `${searchType}:${keyword}` */
interface RemoteSearchData {
  keyword?: string
  searchType?: string
}

/** mute 域 data：key = tag:<tag> / user:<id> / ai */
interface RemoteMuteData {
  value?: string
  enabled?: boolean
}

/** settings 域 data 中 theme 的映射：鸿蒙端用 'system'，Web 端用 'auto' */
function themeToRemote(theme: AppSettings['theme']): string {
  return theme === 'auto' ? 'system' : theme
}

function themeFromRemote(theme: unknown): AppSettings['theme'] | undefined {
  if (theme === 'light' || theme === 'dark') return theme
  if (theme === 'system' || theme === 'auto') return 'auto'
  return undefined
}

// ---------------- 同步元数据持久化（游标本身在 api/sync.ts 的 arkpix.web.sync） ----------------

const META_KEY = 'arkpix.web.sync.meta'

interface Tombstone {
  key: string
  updatedAt: number
}

interface SyncMeta {
  /** 每域本地最后写时间（settings/mute 域 LWW 判定基准） */
  localWrite: Record<string, number>
  /** 每域待上行墓碑（push 成功后清除） */
  tombstones: Record<string, Tombstone[]>
  lastSyncAt: number
  lastSyncResult: string
}

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) throw new Error('empty')
    const obj = JSON.parse(raw) as Partial<SyncMeta>
    return {
      localWrite: obj.localWrite ?? {},
      tombstones: obj.tombstones ?? {},
      lastSyncAt: obj.lastSyncAt ?? 0,
      lastSyncResult: obj.lastSyncResult ?? '',
    }
  } catch {
    return { localWrite: {}, tombstones: {}, lastSyncAt: 0, lastSyncResult: '' }
  }
}

let meta = loadMeta()

function saveMeta(): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

function getLocalWrite(domain: string): number {
  return meta.localWrite[domain] ?? 0
}

function recordLocalWrite(domain: string, ts = Date.now()): void {
  meta.localWrite[domain] = ts
  saveMeta()
}

function getTombstones(domain: string): Tombstone[] {
  return meta.tombstones[domain] ?? []
}

function addTombstones(domain: string, keys: string[]): void {
  if (keys.length === 0) return
  const list = [...getTombstones(domain)]
  const now = Date.now()
  for (const key of keys) {
    const existing = list.find((t) => t.key === key)
    if (existing) existing.updatedAt = now
    else list.push({ key, updatedAt: now })
  }
  meta.tombstones[domain] = list
  saveMeta()
}

function clearTombstones(domain: string): void {
  if (meta.tombstones[domain]) {
    delete meta.tombstones[domain]
    saveMeta()
  }
}

/** 墓碑转为 SyncEntry 追加到上行列表 */
function appendTombstones(domain: string, items: SyncEntry[]): SyncEntry[] {
  for (const t of getTombstones(domain)) {
    items.push({ key: t.key, data: {}, updatedAt: t.updatedAt, deleted: true })
  }
  return items
}

// ---------------- 状态 ----------------

let initialized = false
/** 下行应用期间抑制订阅回传（防回声） */
let applyingRemote = false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncing: Promise<{ ok: boolean; message: string }> | null = null

function canSync(): boolean {
  return useSettingsStore().settings.syncEnabled && useRelayAuthStore().isLoggedIn
}

// ---------------- 订阅：diff 出墓碑与本地写时间 ----------------

function searchKey(searchType: string, keyword: string): string {
  return `${searchType}:${keyword}`
}

export function initSync(): void {
  if (initialized) return
  initialized = true
  const settingsStore = useSettingsStore()
  const historyStore = useHistoryStore()

  let prevSettings = { ...settingsStore.settings }
  settingsStore.$subscribe(
    () => {
      const prev = prevSettings
      const curr = settingsStore.settings
      prevSettings = { ...curr }
      if (applyingRemote) return
      let dirty = false
      // settings 域：可同步子集任一字段变化（syncEnabled 设备本地，不触发）
      if (
        prev.previewQuality !== curr.previewQuality ||
        prev.detailQuality !== curr.detailQuality ||
        prev.antiSocialDeath !== curr.antiSocialDeath ||
        prev.showR18Rank !== curr.showR18Rank ||
        prev.aiFilter !== curr.aiFilter ||
        prev.theme !== curr.theme ||
        prev.muteTags !== curr.muteTags ||
        prev.muteUsers !== curr.muteUsers
      ) {
        recordLocalWrite(DOMAIN_SETTINGS)
        dirty = true
      }
      // mute 域：屏蔽词/屏蔽作者增删 + AI 过滤开关
      if (
        prev.muteTags !== curr.muteTags ||
        prev.muteUsers !== curr.muteUsers ||
        prev.aiFilter !== curr.aiFilter
      ) {
        recordLocalWrite(DOMAIN_MUTE)
        const tombstones: string[] = []
        for (const t of prev.muteTags) if (!curr.muteTags.includes(t)) tombstones.push(`tag:${t}`)
        for (const u of prev.muteUsers)
          if (!curr.muteUsers.includes(u)) tombstones.push(`user:${u}`)
        addTombstones(DOMAIN_MUTE, tombstones)
        dirty = true
      }
      if (dirty) scheduleSync()
    },
    { flush: 'sync' },
  )

  let prevBrowse = historyStore.browse
  let prevSearch = historyStore.search
  historyStore.$subscribe(
    () => {
      const pb = prevBrowse
      const ps = prevSearch
      const cb = historyStore.browse
      const cs = historyStore.search
      prevBrowse = cb
      prevSearch = cs
      if (applyingRemote) return
      addTombstones(
        DOMAIN_HISTORY,
        pb.filter((i) => !cb.some((c) => c.illustId === i.illustId)).map((i) =>
          String(i.illustId),
        ),
      )
      addTombstones(
        DOMAIN_SEARCH_HISTORY,
        ps
          .filter((i) => !cs.some((c) => c.keyword === i.keyword && c.searchType === i.searchType))
          .map((i) => searchKey(i.searchType, i.keyword)),
      )
      scheduleSync()
    },
    { flush: 'sync' },
  )
}

// ---------------- 调度 ----------------

/** 本地变更后 2s 防抖自动同步（syncEnabled 未开时不动作，但墓碑/写时间已记录） */
export function scheduleSync(): void {
  if (applyingRemote || !canSync()) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncNow()
  }, SYNC_DEBOUNCE_MS)
}

// ---------------- collectors（上行） ----------------

function collectSettings(): SyncEntry[] {
  const updatedAt = getLocalWrite(DOMAIN_SETTINGS)
  if (updatedAt <= 0) return [] // 本地从未改过，不上行（等远端覆盖）
  const s = useSettingsStore().settings
  const data: Record<string, unknown> = {
    previewQuality: s.previewQuality,
    detailQuality: s.detailQuality,
    antiSocialDeath: s.antiSocialDeath,
    showR18Rank: s.showR18Rank,
    aiFilter: s.aiFilter,
    muteTags: s.muteTags,
    muteUsers: s.muteUsers,
    theme: themeToRemote(s.theme),
    // syncEnabled 设备本地，不上行
  }
  return [{ key: 'settings', data, updatedAt, deleted: false }]
}

function collectMute(): SyncEntry[] {
  const s = useSettingsStore().settings
  const localWrite = getLocalWrite(DOMAIN_MUTE)
  const updatedAt = localWrite > 0 ? localWrite : Date.now()
  const items: SyncEntry[] = s.muteTags.map((t) => ({
    key: `tag:${t}`,
    data: { value: t },
    updatedAt,
    deleted: false,
  }))
  for (const u of s.muteUsers) {
    items.push({ key: `user:${u}`, data: { value: String(u) }, updatedAt, deleted: false })
  }
  items.push({ key: 'ai', data: { enabled: s.aiFilter }, updatedAt, deleted: false })
  return appendTombstones(DOMAIN_MUTE, items)
}

function collectHistory(): SyncEntry[] {
  const items: SyncEntry[] = useHistoryStore().browse.map((i) => ({
    key: String(i.illustId),
    data: {
      title: i.title,
      imageUrl: i.imageUrl,
      userName: i.userName,
      viewedAt: i.timestamp,
    } satisfies RemoteHistoryData,
    updatedAt: i.timestamp,
    deleted: false,
  }))
  return appendTombstones(DOMAIN_HISTORY, items)
}

function collectSearchHistory(): SyncEntry[] {
  const items: SyncEntry[] = useHistoryStore().search.map((i) => ({
    key: searchKey(i.searchType, i.keyword),
    data: { keyword: i.keyword, searchType: i.searchType } satisfies RemoteSearchData,
    updatedAt: i.timestamp,
    deleted: false,
  }))
  return appendTombstones(DOMAIN_SEARCH_HISTORY, items)
}

function collect(domain: string): SyncEntry[] {
  switch (domain) {
    case DOMAIN_SETTINGS:
      return collectSettings()
    case DOMAIN_MUTE:
      return collectMute()
    case DOMAIN_HISTORY:
      return collectHistory()
    case DOMAIN_SEARCH_HISTORY:
      return collectSearchHistory()
    default:
      return []
  }
}

// ---------------- appliers（下行 LWW 合并） ----------------

function applySettingsItem(item: SyncEntry): void {
  if (item.deleted) return
  if (item.updatedAt <= getLocalWrite(DOMAIN_SETTINGS)) return
  const d = (item.data ?? {}) as Record<string, unknown>
  const patch: Partial<AppSettings> = {}
  if (d.previewQuality === 0 || d.previewQuality === 1 || d.previewQuality === 2) {
    patch.previewQuality = d.previewQuality
  }
  if (d.detailQuality === 0 || d.detailQuality === 1) patch.detailQuality = d.detailQuality
  if (typeof d.antiSocialDeath === 'boolean') patch.antiSocialDeath = d.antiSocialDeath
  if (typeof d.showR18Rank === 'boolean') patch.showR18Rank = d.showR18Rank
  if (typeof d.aiFilter === 'boolean') patch.aiFilter = d.aiFilter
  if (Array.isArray(d.muteTags)) {
    patch.muteTags = d.muteTags.filter((t): t is string => typeof t === 'string')
  }
  if (Array.isArray(d.muteUsers)) {
    patch.muteUsers = d.muteUsers.filter((u): u is number => typeof u === 'number')
  }
  const theme = themeFromRemote(d.theme)
  if (theme) patch.theme = theme
  // syncEnabled 不随远端覆盖本机开关
  if (Object.keys(patch).length > 0) useSettingsStore().update(patch)
}

/** mute 域：按 key 集合并集 + 墓碑移除，批量写回（对齐鸿蒙端 applyMuteItems） */
function applyMuteItems(items: SyncEntry[]): void {
  const s = useSettingsStore().settings
  let muteTags = [...s.muteTags]
  let muteUsers = [...s.muteUsers]
  let aiFilter = s.aiFilter
  const localWrite = getLocalWrite(DOMAIN_MUTE)
  let dirty = false
  for (const item of items) {
    if (item.updatedAt <= localWrite) continue
    if (item.key.startsWith('tag:')) {
      const tag = item.key.substring(4)
      const idx = muteTags.indexOf(tag)
      if (item.deleted) {
        if (idx >= 0) {
          muteTags.splice(idx, 1)
          dirty = true
        }
      } else if (idx < 0) {
        muteTags.push(tag)
        dirty = true
      }
    } else if (item.key.startsWith('user:')) {
      const userId = Number(item.key.substring(5))
      if (Number.isNaN(userId)) continue
      const idx = muteUsers.indexOf(userId)
      if (item.deleted) {
        if (idx >= 0) {
          muteUsers.splice(idx, 1)
          dirty = true
        }
      } else if (idx < 0) {
        muteUsers.push(userId)
        dirty = true
      }
    } else if (item.key === 'ai' && !item.deleted) {
      const enabled = (item.data as RemoteMuteData)?.enabled ?? false
      if (aiFilter !== enabled) {
        aiFilter = enabled
        dirty = true
      }
    }
  }
  if (dirty) useSettingsStore().update({ muteTags, muteUsers, aiFilter })
}

function applyHistoryItem(item: SyncEntry): void {
  const illustId = Number(item.key)
  if (Number.isNaN(illustId)) return
  const store = useHistoryStore()
  if (item.deleted) {
    store.removeBrowseItem(illustId)
    return
  }
  const local = store.browse.find((i) => i.illustId === illustId)
  if (local && local.timestamp >= item.updatedAt) return // LWW：本地更新则跳过
  const d = (item.data ?? {}) as RemoteHistoryData
  store.upsertBrowseEntry({
    illustId,
    title: d.title ?? local?.title ?? '',
    imageUrl: d.imageUrl ?? local?.imageUrl ?? '',
    userName: d.userName ?? local?.userName ?? '',
    userId: local?.userId ?? 0, // 远端 data 无 userId（鸿蒙端结构上行的字段集）
    timestamp: d.viewedAt ?? item.updatedAt,
  })
}

function applySearchHistoryItem(item: SyncEntry): void {
  const sep = item.key.indexOf(':')
  if (sep < 0) return
  const searchType = item.key.substring(0, sep)
  const keyword = item.key.substring(sep + 1)
  const store = useHistoryStore()
  if (item.deleted) {
    store.removeSearchEntry(keyword, searchType)
    return
  }
  const local = store.search.find((i) => i.keyword === keyword && i.searchType === searchType)
  if (local && local.timestamp >= item.updatedAt) return
  store.upsertSearchEntry(keyword, searchType, item.updatedAt)
}

function applyItems(domain: string, items: SyncEntry[]): void {
  if (items.length === 0) return
  if (domain === DOMAIN_MUTE) {
    applyMuteItems(items)
    return
  }
  for (const item of items) {
    try {
      if (domain === DOMAIN_SETTINGS) applySettingsItem(item)
      else if (domain === DOMAIN_HISTORY) applyHistoryItem(item)
      else if (domain === DOMAIN_SEARCH_HISTORY) applySearchHistoryItem(item)
    } catch (e) {
      console.error(`同步条目应用失败（${domain}/${item.key}）`, e)
    }
  }
}

// ---------------- 单域同步 ----------------

async function pullMerge(domain: string): Promise<void> {
  const { items } = await pullDomain(domain, getSyncToken(domain))
  applyingRemote = true
  try {
    applyItems(domain, items)
  } finally {
    applyingRemote = false
  }
}

async function pushLocal(domain: string): Promise<void> {
  const items = collect(domain)
  if (items.length === 0) return
  await pushDomain(domain, items, getSyncToken(domain))
  clearTombstones(domain)
}

/** 单域：pull 合并 → push 本地变更；409 时清游标全量 pull 重建后重推 */
async function syncOneDomain(domain: string): Promise<void> {
  try {
    await pullMerge(domain)
  } catch (e) {
    if (!(e instanceof SyncFullRequiredError)) throw e
    setSyncToken(domain, '')
    await pullMerge(domain)
  }
  try {
    await pushLocal(domain)
  } catch (e) {
    if (!(e instanceof SyncFullRequiredError)) throw e
    setSyncToken(domain, '')
    await pullMerge(domain)
    await pushLocal(domain)
  }
}

// ---------------- 对外入口 ----------------

/** 立即同步：四域依次 pull 合并 + push 本地变更；单域失败不阻断其他域（单飞去重） */
export function syncNow(): Promise<{ ok: boolean; message: string }> {
  if (syncing) return syncing
  syncing = (async () => {
    if (!canSync()) return { ok: false, message: '未开启同步或未登录中继' }
    const failures: string[] = []
    let okCount = 0
    for (const domain of DOMAINS) {
      try {
        await syncOneDomain(domain)
        okCount++
      } catch (e) {
        failures.push(`${domain}: ${e instanceof Error ? e.message : String(e)}`)
        console.error(`同步域失败（${domain}）`, e)
      }
    }
    const ok = failures.length === 0
    const message = ok
      ? `同步完成（${okCount}/${DOMAINS.length} 个域）`
      : `部分失败（${okCount}/${DOMAINS.length}）：${failures.join('；')}`
    meta.lastSyncAt = Date.now()
    meta.lastSyncResult = message
    saveMeta()
    return { ok, message }
  })().finally(() => {
    syncing = null
  })
  return syncing
}

/** 上次同步信息（设置页展示用） */
export function getLastSyncInfo(): { lastSyncAt: number; lastSyncResult: string } {
  return { lastSyncAt: meta.lastSyncAt, lastSyncResult: meta.lastSyncResult }
}
