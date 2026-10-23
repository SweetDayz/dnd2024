<script setup lang="ts">
// 第 6 步：技能與工具。合併職業、背景、種族、專長的熟練；重複時提示改選。
import ProfSummary from './ProfSummary.vue'
import SlotGroup from './SlotGroup.vue'
</script>

<template>
  <div class="step">
    <SlotGroup step="proficiencies" empty="沒有需要在這裡選的熟練；職業的技能選擇在「職業」步驟。" />
    <h3>熟練總覽</h3>
    <ProfSummary :kinds="['skill', 'save', 'tool', 'weapon', 'armor']" />
  </div>
</template>
