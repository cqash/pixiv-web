<script setup lang="ts">
// 图片组件：经 /img/v1/fetch 加载（fetch+Bearer→blob→objectURL），占坑防布局跳动
import { onBeforeUnmount, ref, watch } from 'vue'
import { loadImage, releaseImage } from '../api/image'

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    fit?: 'cover' | 'contain'
    /** 宽/高比，提供时按比例占坑 */
    ratio?: number
  }>(),
  { alt: '', fit: 'cover', ratio: 0 },
)

const objectUrl = ref('')
const failed = ref(false)
const loading = ref(true)
let currentSrc = ''

async function load(src: string) {
  if (currentSrc) releaseImage(currentSrc)
  currentSrc = src
  objectUrl.value = ''
  if (!src) {
    loading.value = false
    failed.value = true
    return
  }
  loading.value = true
  failed.value = false
  try {
    const url = await loadImage(src)
    if (currentSrc !== src) {
      releaseImage(src) // 加载期间已切走
      return
    }
    objectUrl.value = url
  } catch {
    if (currentSrc === src) failed.value = true
  } finally {
    if (currentSrc === src) loading.value = false
  }
}

watch(() => props.src, (s) => load(s), { immediate: true })

onBeforeUnmount(() => {
  if (currentSrc) releaseImage(currentSrc)
  currentSrc = ''
})
</script>

<template>
  <div
    class="cached-image"
    :style="ratio > 0 ? { aspectRatio: String(ratio) } : undefined"
  >
    <img
      v-if="objectUrl && !failed"
      :src="objectUrl"
      :alt="alt"
      :style="{ objectFit: fit }"
      class="img"
    />
    <div v-else-if="failed" class="placeholder failed">加载失败</div>
    <div v-else class="placeholder loading" :class="{ pulse: loading }" />
  </div>
</template>

<style scoped>
.cached-image {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}
.img {
  width: 100%;
  height: 100%;
  display: block;
  animation: fade-in 0.25s ease;
}
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 12px;
  background: var(--bg);
}
.pulse {
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
