<script setup lang="ts">
// 效果頁：角色所有特性、特質、專長中「會影響數值或擲骰」的段落（自動偵測，見 src/rules/effects.ts）。
// 每條標註來源：特性名｜類別：來源條目｜書目頁碼。點一條展開原文。可依角卡欄位篩選（從數值旁的 ✦ 跳過來）。
import { computed, ref } from 'vue'
import SourceBadge from '@/components/SourceBadge.vue'
import RichText from '@/components/entries/RichText.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { effectFieldLabel, effectsFor, type Effect } from '@/rules/effects'

const props = defineProps<{ effects: Effect[]; field: string | null }>()
const emit = defineEmits<{ 'update:field': [field: string | null] }>()
const open = ref(new Set<string>())
const { sheet } = useCharacterBuild()
/** 技能欄位顯示中文名，其餘交給 effectFieldLabel */
const label = (f: string) => {
  const sk = f.startsWith('skill:') ? sheet.value?.skills.find((s) => s.key === f.slice(6)) : undefined
  return sk ? `技能：${sk.name}` : effectFieldLabel(f)
}

const shown = computed(() => (props.field ? effectsFor(props.effects, props.field) : props.effects))
const CAT: Record<string, string> = {
  class: '職業',
  subclass: '子職',
  race: '種族',
  background: '背景',
  feat: '專長',
  optionalfeature: '可選特性',
}
const fields = computed(() => [...new Set(props.effects.flatMap((e) => e.fields))].sort())
function toggle(k: string) {
  const s = new Set(open.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  open.value = s
}
</script>

<template>
  <div class="effects" data-testid="effects">
    <p class="muted">
      自動偵測：特性原文中提到優勢、劣勢、豁免、抗性、AC、速度、傷害等的段落都列在這裡（寧可多列，不要漏列）。
      這些效果程式無法自動計算，請依原文判斷，必要時在角卡數值上手動覆寫（✎）。
    </p>
    <div class="fields">
      <button type="button" :class="{ sel: !field }" @click="emit('update:field', null)">全部（{{ effects.length }}）</button>
      <button
        v-for="f in fields"
        :key="f"
        type="button"
        :class="{ sel: field === f }"
        :data-field="f"
        @click="emit('update:field', f)"
      >
        {{ label(f) }}
      </button>
    </div>
    <ul>
      <li v-for="e in shown" :key="e.key" data-testid="effect">
        <button type="button" class="head" @click="toggle(e.key)">
          <strong>{{ e.title }}</strong>
          <span class="src">｜{{ CAT[e.feature.category] }}：{{ e.feature.origin.name }}｜</span>
          <SourceBadge :source="e.feature.entry.source" :page="e.feature.entry.page" />
          <span class="hits">{{ e.hits.join('・') }}</span>
        </button>
        <p v-if="open.has(e.key)" class="raw"><RichText :text="e.raw" /></p>
        <p v-else class="text">{{ e.text.length > 120 ? `${e.text.slice(0, 120)}…` : e.text }}</p>
      </li>
    </ul>
    <p v-if="!shown.length" class="muted">沒有相關效果。</p>
  </div>
</template>

<style scoped>
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}
.fields button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.fields .sel {
  border-color: var(--color-tce);
  color: var(--color-tce);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1);
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.src {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.hits {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-tce);
}
.text,
.raw {
  margin: var(--space-1) 0 0;
  font-size: 0.9rem;
}
.text {
  color: var(--color-text-muted);
}
.muted {
  color: var(--color-text-muted);
}
</style>
