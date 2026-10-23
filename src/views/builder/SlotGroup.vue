<script setup lang="ts">
// 某一步的所有選擇欄位。沒有欄位時顯示提示文字。
// skipSpells：法術步驟的法術欄位改由 SpellPicker 的表格選，這裡只列其他欄位（例如施法屬性）。
import { computed } from 'vue'
import ChoiceSlotView from '@/components/builder/ChoiceSlotView.vue'
import type { Step } from '@/rules/build'
import { useCharacterBuild } from '@/composables/useCharacterBuild'

const props = defineProps<{ step: Step; empty?: string; skipSpells?: boolean }>()
const { build } = useCharacterBuild()
const slots = computed(
  () => build.value?.slots.filter((s) => s.step === props.step && !(props.skipSpells && s.type === 'spell' && s.spell)) ?? [],
)
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
