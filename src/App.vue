<script setup lang="ts">
// 根组件：把主题设置落到 <html data-theme>
import { watch } from 'vue'
import { useSettingsStore } from './stores/settings'

const settingsStore = useSettingsStore()

watch(
  () => settingsStore.settings.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme
  },
  { immediate: true },
)
</script>

<template>
  <!-- KeepAlive 缓存 HomeView：详情页返回时列表数据/图片/滚动位置原样恢复，不重新加载 -->
  <RouterView v-slot="{ Component }">
    <KeepAlive include="HomeView">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
