<script setup lang="ts">
// 第 3 步：背景。2024 規則下背景提供屬性加值（在「屬性值」步驟選）、起源專長、技能與工具熟練。
import { computed } from 'vue'
import EntryPicker from '@/components/builder/EntryPicker.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import SlotGroup from './SlotGroup.vue'

const { data, store } = useCharacterBuild()
const list = computed(() => data.value.list('background').filter((e) => data.value.visible(e)))
const COMPAT = '2014 版背景：依 2024 規則改為任選屬性 +2/+1 或 +1/+1/+1、任選一個起源專長，背景原本的語言不採用。'
</script>

<template>
  <div class="step">
    <EntryPicker
      :entries="list"
      :model-value="store.current?.backgroundId ?? null"
      :compat-note="COMPAT"
      @update:model-value="(id) => store.update((c) => (c.backgroundId = id))"
    />
    <template v-if="store.current?.backgroundId">
      <h3>背景的選擇</h3>
      <p class="muted">屬性加值在「屬性值」步驟選；技能、工具在「技能與工具」步驟檢查。</p>
      <SlotGroup step="background" empty="這個背景沒有需要在這裡選的項目。" />
    </template>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-text-muted);
}
</style>
