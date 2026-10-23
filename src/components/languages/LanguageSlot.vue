<script setup lang="ts">
// 建角精靈的語言選擇（M7-6）：與資料瀏覽器共用 LanguageTable。
// 2024 規則：預設只列標準語言；打開「顯示稀有與其他語言」才列出稀有（含 2014 異域）與其他語言，名稱旁標示，
// 選了的話審卡報告警示區會提示。秘密語言不在選項裡（規則引擎已排除）。
import { computed, ref } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { languageRowOf, type LanguageRow } from '@/rules/data'
import type { ChoiceSlot } from '@/rules/build'
import LanguageTable from './LanguageTable.vue'

const props = defineProps<{ choice: ChoiceSlot }>()
const { data, store } = useCharacterBuild()

const showRestricted = ref(props.choice.selected.some((v) => props.choice.options.find((o) => o.value === v)?.restricted))
const optionOf = (key: string) => props.choice.options.find((o) => o.value === key)
const restrictedCount = computed(() => props.choice.options.filter((o) => o.restricted).length)
const rows = computed(() =>
  props.choice.options
    .filter((o) => showRestricted.value || !o.restricted || props.choice.selected.includes(o.value))
    .map((o) => languageRowOf(data.value, o.value))
    .filter((r): r is LanguageRow => !!r),
)
const selected = (r: LanguageRow) => props.choice.selected.includes(r.key)
const filled = computed(() => props.choice.selected.filter(Boolean).length)
const disabled = (r: LanguageRow) =>
  !selected(r) && props.choice.count > 1 && filled.value >= props.choice.count ? `已選滿 ${props.choice.count} 項` : undefined
const note = (r: LanguageRow) => {
  const o = optionOf(r.key)
  return o?.restricted ? `${o.group ?? '稀有'}語言（需 DM 同意）` : undefined
}

function toggle(r: LanguageRow) {
  const sel = props.choice.selected.filter(Boolean)
  if (sel.includes(r.key)) store.setChoice(props.choice.key, sel.filter((v) => v !== r.key))
  else if (props.choice.count === 1) store.setChoice(props.choice.key, [r.key])
  else if (sel.length < props.choice.count) store.setChoice(props.choice.key, [...sel, r.key])
}
</script>

<template>
  <div class="slot" :class="{ done: choice.done }" :data-slot="choice.key" data-testid="choice-slot">
    <div class="head">
      <strong>{{ choice.label }}</strong>
      <span class="status">{{ choice.done ? '✓ 已完成' : `已選 ${filled}／${choice.count}` }}</span>
    </div>
    <ul v-if="choice.warnings.length" class="warnings">
      <li v-for="w in choice.warnings" :key="w">⚠ {{ w }}</li>
    </ul>
    <LanguageTable
      :table-id="`builder:${choice.key}`"
      :rows="rows"
      :defaults="{}"
      :select="choice.count === 1 ? 'radio' : 'checkbox'"
      :selected="selected"
      :disabled="disabled"
      :note="note"
      @toggle="toggle"
    >
      <template #toolbar>
        <label v-if="choice.restrictedToggle && restrictedCount" class="restricted" data-testid="show-restricted">
          <input v-model="showRestricted" type="checkbox" />
          {{ choice.restrictedToggle }}（{{ restrictedCount }}）
        </label>
      </template>
    </LanguageTable>
  </div>
</template>

<style scoped>
.slot {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius);
}
.slot.done {
  border-left-color: var(--color-tce);
}
.head {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  margin-bottom: var(--space-2);
}
.status {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.warnings {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-3);
  color: var(--color-danger);
}
.restricted {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
