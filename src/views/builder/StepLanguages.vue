<script setup lang="ts">
// 第 7 步：語言。2024 規則：通用語＋兩種標準語言，再加上種族、專長等給的語言。
// 「標準語言（選 2）」這個欄位改用語言表格（M7-6，可排序、篩選）；其他欄位（種族、背景給的任選）照舊。
import { computed } from 'vue'
import ChoiceSlotView from '@/components/builder/ChoiceSlotView.vue'
import LanguageSlot from '@/components/languages/LanguageSlot.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import ProfSummary from './ProfSummary.vue'

const { build } = useCharacterBuild()
const slots = computed(() => build.value?.slots.filter((s) => s.step === 'languages') ?? [])
</script>

<template>
  <div class="step">
    <template v-for="s in slots" :key="s.key">
      <LanguageSlot v-if="s.key === 'base:languages'" :choice="s" />
      <ChoiceSlotView v-else :choice="s" />
    </template>
    <h3>已知語言</h3>
    <ProfSummary :kinds="['language']" />
  </div>
</template>
