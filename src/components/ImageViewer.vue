<script setup lang="ts">
// 全屏图片查看器：翻页（箭头/键盘/滑动）+ 缩放（滚轮/双击/拖拽平移）+ 下载 + 防社死遮罩
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Illust } from '../api/types'
import { loadImage, releaseImage } from '../api/image'
import { imageExt, pickDetailUrl } from '../utils/imageQuality'
import { useSettingsStore } from '../stores/settings'
import CachedImage from './CachedImage.vue'

const props = defineProps<{ illust: Illust; initialIndex: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const settingsStore = useSettingsStore()

const pageCount = computed(() => Math.max(1, props.illust.page_count))
const index = ref(Math.min(Math.max(0, props.initialIndex), pageCount.value - 1))

const src = computed(() =>
  pickDetailUrl(props.illust, index.value, settingsStore.settings.detailQuality),
)

// ---- 防社死遮罩（按页单向揭示） ----
const revealedPages = ref<number[]>([])
const masked = computed(
  () =>
    settingsStore.settings.antiSocialDeath &&
    props.illust.x_restrict > 0 &&
    !revealedPages.value.includes(index.value),
)
function reveal() {
  if (!revealedPages.value.includes(index.value)) {
    revealedPages.value = [...revealedPages.value, index.value]
  }
}

// ---- 翻页 ----
function prev() {
  if (index.value > 0) setPage(index.value - 1)
}
function next() {
  if (index.value < pageCount.value - 1) setPage(index.value + 1)
}
function setPage(i: number) {
  index.value = i
  resetZoom()
}

// ---- 缩放 / 平移 ----
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)

function clampScale(s: number): number {
  return Math.min(5, Math.max(0.5, s))
}

function resetZoom() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25
  const nextScale = clampScale(scale.value * factor)
  scale.value = nextScale
  if (nextScale === 1) {
    tx.value = 0
    ty.value = 0
  }
}

function onDblClick() {
  if (scale.value === 1) {
    scale.value = 2.5
  } else {
    resetZoom()
  }
}

const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragBaseX = 0
let dragBaseY = 0

function onPointerDown(e: PointerEvent) {
  if (scale.value <= 1) return
  dragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragBaseX = tx.value
  dragBaseY = ty.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  tx.value = dragBaseX + (e.clientX - dragStartX)
  ty.value = dragBaseY + (e.clientY - dragStartY)
}
function onPointerUp() {
  dragging.value = false
}

// ---- 触摸滑动翻页（未缩放时） ----
let touchStartX = 0
let touchStartY = 0
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
}
function onTouchEnd(e: TouchEvent) {
  if (scale.value > 1) return
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) next()
    else prev()
  }
}

// ---- 键盘 ----
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

// ---- 下载当前页 ----
const downloading = ref(false)
async function downloadCurrent() {
  if (downloading.value) return
  downloading.value = true
  const url = src.value
  try {
    const objectUrl = await loadImage(url)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${props.illust.id}_p${index.value}.${imageExt(url)}`
    a.click()
  } catch (e) {
    console.error('下载失败', e)
  } finally {
    releaseImage(url)
    downloading.value = false
  }
}

// ---- 生命周期：禁 body 滚动 + 键盘监听 ----
onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="viewer" @click.self="emit('close')">
    <!-- 顶栏 -->
    <div class="topbar">
      <span class="page-indicator">{{ index + 1 }} / {{ pageCount }}</span>
      <div class="topbar-actions">
        <button class="icon-btn" :disabled="downloading" title="下载当前页" @click="downloadCurrent">
          ⬇
        </button>
        <button class="icon-btn" title="关闭" @click="emit('close')">×</button>
      </div>
    </div>

    <!-- 图片区 -->
    <div
      class="stage"
      @wheel.prevent="onWheel"
      @dblclick="onDblClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div
        class="image-box"
        :class="{ draggable: scale > 1, dragging }"
        :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
      >
        <CachedImage :key="index" :src="src" fit="contain" :alt="illust.title" />
        <div v-if="masked" class="r18-mask" @click.stop="reveal">🔒</div>
      </div>
    </div>

    <!-- 左右箭头 -->
    <button v-if="pageCount > 1 && index > 0" class="arrow left" @click.stop="prev">‹</button>
    <button v-if="pageCount > 1 && index < pageCount - 1" class="arrow right" @click.stop="next">
      ›
    </button>
  </div>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  z-index: 2;
}
.page-indicator {
  color: #fff;
  font-size: 13px;
  opacity: 0.85;
}
.topbar-actions {
  display: flex;
  gap: 8px;
}
.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
.stage {
  flex: 1;
  position: relative;
  overflow: hidden;
  touch-action: none;
}
.image-box {
  position: absolute;
  inset: 0;
  transform-origin: center center;
}
.image-box.draggable {
  cursor: grab;
}
.image-box.dragging {
  cursor: grabbing;
}
.r18-mask {
  position: absolute;
  inset: 0;
  background: var(--mask-r18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  cursor: pointer;
}
.arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 26px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.arrow:hover {
  background: rgba(255, 255, 255, 0.3);
}
.arrow.left {
  left: 12px;
}
.arrow.right {
  right: 12px;
}
</style>
