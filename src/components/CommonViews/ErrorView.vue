<script setup lang="ts">
// 通用错误态：错误文字 + 重试按钮
withDefaults(defineProps<{ message?: string }>(), { message: '加载失败' })
const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div class="error-view">
    <p class="message">{{ message }}</p>
    <button class="secondary" @click="emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 12px;
}
.message {
  margin: 0;
  color: var(--accent-danger);
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}
</style>
