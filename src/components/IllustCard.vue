<script setup lang="ts">
// 公共作品卡片：预览图 + 角标（页数/R18）+ 收藏红心 + 标题作者 + 防社死遮罩
// 整卡是真实 <a> 链接（RouterLink）：支持中键/Ctrl+点击/右键新标签页打开详情
import { computed } from 'vue'
import type { Illust } from '../api/types'
import { pickPreviewUrl } from '../utils/imageQuality'
import { useSettingsStore } from '../stores/settings'
import { useBookmarkStore } from '../stores/bookmarks'
import CachedImage from './CachedImage.vue'

const props = defineProps<{ illust: Illust }>()

const settingsStore = useSettingsStore()
const bookmarkStore = useBookmarkStore()

const previewSrc = computed(() =>
  pickPreviewUrl(props.illust, settingsStore.settings.previewQuality),
)

// 高/宽 > 3 的超长图降级为方图，避免瀑布流被拉垮
const ratio = computed(() => {
  const { width, height } = props.illust
  if (width <= 0 || height <= 0) return 1
  if (height / width > 3) return 1
  return width / height
})

const bookmarkState = computed(() => bookmarkStore.stateOf(props.illust.id))

const masked = computed(
  () => settingsStore.settings.antiSocialDeath && props.illust.x_restrict > 0,
)

async function onToggleBookmark() {
  try {
    await bookmarkStore.toggle(props.illust.id)
  } catch (e) {
    console.error('收藏操作失败', e) // store 已回滚状态
  }
}
</script>

<template>
  <RouterLink
    :to="{ name: 'illust-detail', params: { id: illust.id } }"
    class="illust-card"
  >
    <div class="image-wrap">
      <CachedImage :src="previewSrc" :ratio="ratio" :alt="illust.title" />
      <div class="badges">
        <span v-if="illust.page_count > 1" class="badge pages">{{ illust.page_count }}P</span>
        <span v-if="illust.x_restrict === 1" class="badge r18">R18</span>
        <span v-else-if="illust.x_restrict === 2" class="badge r18">R18G</span>
      </div>
      <button
        class="heart"
        :class="{ active: bookmarkState === 2 }"
        :disabled="bookmarkState === 1"
        @click.stop.prevent="onToggleBookmark"
      >
        {{ bookmarkState === 2 ? '❤' : '♡' }}
      </button>
      <div v-if="masked" class="r18-mask">🔒</div>
    </div>
    <div class="info">
      <p class="title" :title="illust.title">{{ illust.title }}</p>
      <p class="author">{{ illust.user.name }}</p>
    </div>
  </RouterLink>
</template>

<style scoped>
.illust-card {
  display: block;
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  cursor: pointer;
  color: inherit;
  text-decoration: none;
}
.image-wrap {
  position: relative;
}
.badges {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}
.badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}
.badge.r18 {
  background: var(--accent-danger);
}
.heart {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #9ca3af;
  font-size: 17px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
}
.heart.active {
  color: #ff4081;
}
.heart:disabled {
  opacity: 0.6;
}
.r18-mask {
  position: absolute;
  inset: 0;
  background: var(--mask-r18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}
.info {
  padding: 8px 10px 10px;
}
.title {
  margin: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.author {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
