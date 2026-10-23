<script setup lang="ts">
// 第 7 步：語言。2024 規則：通用語＋兩種標準語言，再加上種族、專長等給的語言。
import ProfSummary from './ProfSummary.vue'
import SlotGroup from './SlotGroup.vue'
</script>

<template>
  <div class="step">
    <SlotGroup step="languages" />
    <h3>已知語言</h3>
    <ProfSummary :kinds="['language']" />
  </div>
</template>
