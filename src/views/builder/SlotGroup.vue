<script setup lang="ts">
// 某一步的所有選擇欄位。沒有欄位時顯示提示文字。
import { computed } from 'vue'
import ChoiceSlotView from '@/components/builder/ChoiceSlotView.vue'
import type { Step } from '@/rules/build'
import { useCharacterBuild } from '@/composables/useCharacterBuild'

const props = defineProps<{ step: Step; empty?: string }>()
const { build } = useCharacterBuild()
const slots = computed(() => build.value?.slots.filter((s) => s.step === props.step) ?? [])
</script>

<template>
  <section class="slots">
    <ChoiceSlotView v-for="s in slots" :key="s.key" :choice="s" />
    <p v-if="!slots.length && empty" class="muted">{{ empty }}</p>
  </section>
</template>

<style scoped>
.muted {
  color: var(--color-text-muted);
}
</style>
