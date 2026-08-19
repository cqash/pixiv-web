<script setup lang="ts">
// 通用空态
withDefaults(defineProps<{ text?: string }>(), { text: '暂无内容' })
</script>

<template>
  <div class="empty-view">
    <p class="text">{{ text }}</p>
  </div>
</template>

<style scoped>
.empty-view {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}
.text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
