<script setup lang="ts">
// 法術：上方是施法總覽（各施法職業、法術位、其他來源）；其他非法術的選擇欄位（例如施法屬性）照舊列出；
// 法術選擇本身（職業的戲法、法術書與準備，以及子職、種族、專長給的法術）在 SpellPicker 裡依來源分組選，
// 右側隨時顯示角色從所有來源學會的法術。
import CastingOverview from '@/components/spells/CastingOverview.vue'
import SpellPicker from '@/components/spells/SpellPicker.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import SlotGroup from './SlotGroup.vue'

const { casting } = useCharacterBuild()
</script>

<template>
  <div class="step">
    <CastingOverview />
    <p v-if="!casting.length" class="muted">職業沒有施法能力；種族或專長給的法術仍會列在右側。</p>

    <SlotGroup step="spells" skip-spells />
    <SpellPicker />
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-text-muted);
}
</style>
