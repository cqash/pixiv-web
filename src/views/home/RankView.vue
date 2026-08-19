<script setup lang="ts">
// 排行页：模式下拉（含可选 R18 组）+ 日期选择
import { computed, ref } from 'vue'
import { fetchRanking } from '../../api/pixiv'
import { useSettingsStore } from '../../stores/settings'
import IllustWaterfall from '../../components/IllustWaterfall.vue'

const settingsStore = useSettingsStore()

const NORMAL_MODES: Array<{ value: string; label: string }> = [
  { value: 'day', label: '日榜' },
  { value: 'week', label: '周榜' },
  { value: 'month', label: '月榜' },
  { value: 'day_male', label: '男性向' },
  { value: 'day_female', label: '女性向' },
  { value: 'week_original', label: '原创' },
  { value: 'week_rookie', label: '新人' },
]

const R18_MODES: Array<{ value: string; label: string }> = [
  { value: 'day_r18', label: 'R-18 日榜' },
  { value: 'day_male_r18', label: 'R-18 男性向' },
  { value: 'day_female_r18', label: 'R-18 女性向' },
  { value: 'week_r18', label: 'R-18 周榜' },
  { value: 'week_r18g', label: 'R-18G 周榜' },
]

const showR18 = computed(() => settingsStore.settings.showR18Rank)

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const mode = ref('day')
const date = ref(yesterday())
const reloadToken = ref(0)

const fetchFirst = computed(() => () => fetchRanking(mode.value, date.value))

function onConditionChange() {
  reloadToken.value++
}
</script>

<template>
  <div>
    <div class="filter-bar">
      <select v-model="mode" class="filter-input" @change="onConditionChange">
        <optgroup label="普通">
          <option v-for="m in NORMAL_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </optgroup>
        <optgroup v-if="showR18" label="R-18">
          <option v-for="m in R18_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </optgroup>
      </select>
      <input v-model="date" type="date" class="filter-input" @change="onConditionChange" />
    </div>
    <IllustWaterfall :fetch-first="fetchFirst" :reload-token="reloadToken" cache-key="rank" />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.filter-input {
  width: auto;
  flex: 0 1 200px;
}
</style>
