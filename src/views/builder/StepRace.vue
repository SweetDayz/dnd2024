<script setup lang="ts">
// 第 4 步：種族（物種）。有血系／譜系的種族（例如侏儒）在這裡選版本。
import { computed } from 'vue'
import EntryPicker from '@/components/builder/EntryPicker.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { sizeLabel } from '@/rules/build'
import SlotGroup from './SlotGroup.vue'

const { data, store } = useCharacterBuild()
const list = computed(() => data.value.list('race').filter((e) => data.value.visible(e)))
const COMPAT = '2014 版種族：依 2024 規則不採用種族的屬性加值（改由背景提供）；種族的語言照給，但標示「2014 版」（2024 規則另有通用語＋兩種標準語言）。'
const speedText = (sp: unknown) =>
  typeof sp === 'number'
    ? `${sp} 呎`
    : Object.entries((sp as Record<string, unknown>) ?? {})
        .map(([k, v]) => `${k} ${v === true ? '同步行' : v}`)
        .join('、')
</script>

<template>
  <div class="step">
    <EntryPicker
      :entries="list"
      :model-value="store.current?.raceId ?? null"
      :compat-note="COMPAT"
      @update:model-value="(id) => store.update((c) => (c.raceId = id))"
    >
      <template #detail="{ entry }">
        <ul class="facts">
          <li>體型：{{ ((entry.size as string[]) ?? []).map(sizeLabel).join(' 或 ') }}</li>
          <li>速度：{{ speedText(entry.speed) }}</li>
          <li v-if="entry.darkvision">黑暗視覺：{{ entry.darkvision }} 呎</li>
        </ul>
      </template>
    </EntryPicker>
    <template v-if="store.current?.raceId">
      <h3>種族的選擇</h3>
      <SlotGroup step="race" empty="這個種族沒有需要選的項目。" />
    </template>
  </div>
</template>

<style scoped>
.facts {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-3);
}
</style>
