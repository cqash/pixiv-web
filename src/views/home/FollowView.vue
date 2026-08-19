<script setup lang="ts">
// 关注页：已关注作者新作品，public/private 切换
import { computed, ref } from 'vue'
import { fetchFollowIllusts } from '../../api/pixiv'
import IllustWaterfall from '../../components/IllustWaterfall.vue'

const restrict = ref<'public' | 'private'>('public')
const reloadToken = ref(0)

const fetchFirst = computed(() => () => fetchFollowIllusts(restrict.value))

function switchRestrict(r: 'public' | 'private') {
  if (restrict.value === r) return
  restrict.value = r
  reloadToken.value++
}
</script>

<template>
  <div>
    <div class="switch-bar">
      <button
        class="switch-btn"
        :class="{ active: restrict === 'public' }"
        @click="switchRestrict('public')"
      >
        公开
      </button>
      <button
        class="switch-btn"
        :class="{ active: restrict === 'private' }"
        @click="switchRestrict('private')"
      >
        私密
      </button>
    </div>
    <IllustWaterfall :fetch-first="fetchFirst" :reload-token="reloadToken" cache-key="follow" />
  </div>
</template>

<style scoped>
.switch-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.switch-btn {
  padding: 4px 14px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.switch-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
</style>
