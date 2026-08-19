<script setup lang="ts">
// 通用加载态：转圈 + 文字
withDefaults(defineProps<{ text?: string }>(), { text: '加载中…' })
</script>

<template>
  <div class="loading-view">
    <div class="spinner" />
    <p class="text">{{ text }}</p>
  </div>
</template>

<style scoped>
.loading-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 12px;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
