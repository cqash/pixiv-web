// 内容过滤纯函数（对齐鸿蒙端 MuteFilter）：屏蔽作者 / AI 过滤 / 屏蔽词（标题或 tag 命中，不区分大小写）

import type { Illust } from '../api/types'

export interface MuteConfig {
  muteTags: string[]
  muteUsers: number[]
  aiFilter: boolean
}

export function isMuted(illust: Illust, cfg: MuteConfig): boolean {
  if (cfg.muteUsers.includes(illust.user.id)) return true
  if (cfg.aiFilter && illust.illust_ai_type === 2) return true
  if (cfg.muteTags.length > 0) {
    const lowerTags = cfg.muteTags.map((t) => t.toLowerCase())
    if (lowerTags.some((t) => illust.title.toLowerCase().includes(t))) return true
    for (const tag of illust.tags) {
      const name = tag.name.toLowerCase()
      if (lowerTags.some((t) => name.includes(t))) return true
    }
  }
  return false
}

export function filterMuted(illusts: Illust[], cfg: MuteConfig): Illust[] {
  return illusts.filter((i) => !isMuted(i, cfg))
}
