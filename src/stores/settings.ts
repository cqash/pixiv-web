// 浏览设置：画质档位 / 防社死 / R18 排行 / AI 过滤 / 屏蔽词 / 屏蔽作者 / 同步开关，localStorage 持久化
// syncEnabled 为设备本地开关，不参与同步上行（services/syncService.ts 上行子集显式排除）

import { defineStore } from 'pinia'

const STORAGE_KEY = 'arkpix.web.settings'

export interface AppSettings {
  previewQuality: 0 | 1 | 2 // 列表预览：0 缩略 1 中 2 大
  detailQuality: 0 | 1 // 详情/查看器：0 大图 1 原图
  antiSocialDeath: boolean // 防社死：R18 图遮罩
  showR18Rank: boolean // R18 榜单入口
  aiFilter: boolean // 过滤 AI 生成（illust_ai_type===2）
  muteTags: string[]
  muteUsers: number[] // user.id
  theme: 'auto' | 'light' | 'dark'
  syncEnabled: boolean // 数据同步开关（设备本地，不上行）
}

const DEFAULTS: AppSettings = {
  previewQuality: 1,
  detailQuality: 0,
  antiSocialDeath: false,
  showR18Rank: false,
  aiFilter: false,
  muteTags: [],
  muteUsers: [],
  theme: 'auto',
  syncEnabled: false,
}

function loadPersisted(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const obj = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULTS, ...obj, muteTags: obj.muteTags ?? [], muteUsers: obj.muteUsers ?? [] }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): { settings: AppSettings } => ({ settings: loadPersisted() }),
  actions: {
    update(patch: Partial<AppSettings>) {
      this.settings = { ...this.settings, ...patch }
      this.persist()
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    },
    addMuteTag(tag: string) {
      const t = tag.trim()
      if (t && !this.settings.muteTags.includes(t)) {
        this.update({ muteTags: [...this.settings.muteTags, t] })
      }
    },
    removeMuteTag(tag: string) {
      this.update({ muteTags: this.settings.muteTags.filter((t) => t !== tag) })
    },
    addMuteUser(userId: number) {
      if (!this.settings.muteUsers.includes(userId)) {
        this.update({ muteUsers: [...this.settings.muteUsers, userId] })
      }
    },
    removeMuteUser(userId: number) {
      this.update({ muteUsers: this.settings.muteUsers.filter((id) => id !== userId) })
    },
  },
})
