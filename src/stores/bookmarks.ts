// 收藏状态三态注册表：Map<illustId, 0|1|2>（未收藏/请求中/已收藏）
// 含请求中锁、失败回滚；seedFromList 在列表入库时播种初始状态

import { defineStore } from 'pinia'
import { bookmarkAdd, bookmarkDelete } from '../api/pixiv'
import type { Illust } from '../api/types'

export type BookmarkState = 0 | 1 | 2

export const useBookmarkStore = defineStore('bookmarks', {
  state: (): { states: Map<number, BookmarkState> } => ({ states: new Map() }),
  actions: {
    stateOf(illustId: number): BookmarkState {
      return this.states.get(illustId) ?? 0
    },
    seedFromList(illusts: Illust[]) {
      let changed = false
      const next = new Map(this.states)
      for (const i of illusts) {
        // 已有请求中状态不覆盖
        if (next.get(i.id) !== 1) {
          const s: BookmarkState = i.is_bookmarked ? 2 : 0
          if (next.get(i.id) !== s) {
            next.set(i.id, s)
            changed = true
          }
        }
      }
      if (changed) this.states = next
    },
    setState(illustId: number, s: BookmarkState) {
      const next = new Map(this.states)
      next.set(illustId, s)
      this.states = next
    },
    /** 切换收藏；返回最终是否已收藏。失败回滚并抛错 */
    async toggle(illustId: number, restrict: 'public' | 'private' = 'public'): Promise<boolean> {
      const current = this.stateOf(illustId)
      if (current === 1) return true // 请求中，忽略重复点击
      const target = current === 2 ? 0 : 2
      this.setState(illustId, 1)
      try {
        if (target === 2) await bookmarkAdd(illustId, restrict)
        else await bookmarkDelete(illustId)
        this.setState(illustId, target)
        return target === 2
      } catch (e) {
        this.setState(illustId, current) // 回滚
        throw e
      }
    },
  },
})
