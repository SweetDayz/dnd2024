<script setup lang="ts">
// 第 2 步：起始職業。選了之後顯示 1 級的技能選擇等。
import { computed } from 'vue'
import EntryPicker from '@/components/builder/EntryPicker.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITY_NAME, isAbility } from '@/rules/abilities'
import type { Entry } from '@/data/types'
import SlotGroup from './SlotGroup.vue'

const { data, store } = useCharacterBuild()

const classes = computed(() => data.value.list('class').filter((c) => data.value.visible(c)))
const startId = computed(() => store.current?.levels[0]?.classId ?? null)

function setClass(id: string | null) {
  if (!id) return
  store.update((c) => {
    const old = c.levels[0]?.classId
    if (!c.levels.length) c.levels.push({ classId: id, hp: { mode: 'average' } })
    // 換起始職業：原本屬於舊職業的等級都改成新職業
    else for (const l of c.levels) if (l.classId === old) l.classId = id
  })
}

const abil = (list: unknown) =>
  ((list as string[] | undefined) ?? []).map((a) => (isAbility(a) ? ABILITY_NAME[a].zh : a)).join('、')
const primary = (e: Entry) =>
  ((e.primaryAbility as Record<string, boolean>[] | undefined) ?? []).map((o) => abil(Object.keys(o)).replace(/、/g, '＋')).join(' 或 ')
</script>

<template>
  <div class="step">
    <EntryPicker :entries="classes" :model-value="startId" @update:model-value="setClass">
      <template #detail="{ entry }">
        <ul class="facts">
          <li>生命骰：d{{ (entry.hd as { faces?: number })?.faces }}</li>
          <li>豁免熟練：{{ abil(entry.proficiency) }}</li>
          <li v-if="primary(entry)">主要屬性：{{ primary(entry) }}</li>
        </ul>
      </template>
    </EntryPicker>
    <h3 v-if="startId">1 級的選擇</h3>
    <SlotGroup v-if="startId" step="class" empty="這個職業 1 級沒有需要選的項目。" />
  </div>
</template>

<style scoped>
.facts {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-3);
}
</style>
