<script setup lang="ts">
// 推荐页：Pixiv 推荐流
import { fetchRecommended } from '../../api/pixiv'
import IllustWaterfall from '../../components/IllustWaterfall.vue'
</script>

<template>
  <IllustWaterfall :fetch-first="fetchRecommended" cache-key="recommend" />
</template>
