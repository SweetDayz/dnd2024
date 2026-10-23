<script setup lang="ts">
// 一個「選擇欄位」：例如「技能熟練（選 2）」「起源專長」「譜系／版本」。
// 依欄位類型決定外觀：屬性 +2/+1 用下拉選單、少量選項用按鈕、有條目的選項（專長、法術、子職）用可搜尋清單。
// 選擇直接寫回 character store；規則引擎會重算並產生新的選擇欄位（例如選了專長之後的專長選項）。
import { computed, ref } from 'vue'
import type { ChoiceOption, ChoiceSlot } from '@/rules/build'
import { useCharacterStore } from '@/stores/character'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import SourceBadge from '../SourceBadge.vue'
import EntryBlock from '../entries/EntryBlock.vue'
import OriginChip from './OriginChip.vue'

const props = withDefaults(defineProps<{ choice: ChoiceSlot; showOrigin?: boolean }>(), { showOrigin: true })
const store = useCharacterStore()
const filter = useSourceFilterStore()

const query = ref('')
/** 選完的長清單預設收合，只顯示已選項目；按「修改」展開 */
const editing = ref(false)
const collapsed = computed(() => hasEntries.value && props.choice.done && !props.choice.warnings.length && !editing.value)
const selectedLabels = computed(() =>
  props.choice.selected.map((v) => props.choice.options.find((o) => o.value === v)?.label ?? v),
)
const openId = ref<string | null>(null)

const hasEntries = computed(() => props.choice.options.some((o) => o.entry))
const filled = computed(() => props.choice.selected.filter(Boolean).length)
const status = computed(() => {
  if (filled.value === 0) return { text: '未選擇 (No Choice Made)', cls: 'none' }
  if (!props.choice.done) return { text: `已選 ${filled.value}／${props.choice.count}`, cls: 'part' }
  return { text: '已完成', cls: 'done' }
})

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.choice.options
  return props.choice.options.filter(
    (o) => o.label.toLowerCase().includes(q) || o.entry?.engName?.toLowerCase().includes(q) || props.choice.selected.includes(o.value),
  )
})

const isSelected = (o: ChoiceOption) => props.choice.selected.includes(o.value)

function toggle(o: ChoiceOption) {
  const sel = props.choice.selected.filter(Boolean)
  if (isSelected(o)) store.setChoice(props.choice.key, sel.filter((v) => v !== o.value))
  else if (props.choice.count === 1) store.setChoice(props.choice.key, [o.value])
  else if (sel.length < props.choice.count) store.setChoice(props.choice.key, [...sel, o.value])
}

/** abilityWeighted：第 i 個位置選某屬性 */
function setWeighted(i: number, value: string) {
  const sel = [...props.choice.selected]
  while (sel.length < props.choice.count) sel.push('')
  sel[i] = value
  store.setChoice(props.choice.key, sel.some(Boolean) ? sel : [])
}

function blocked(o: ChoiceOption): boolean {
  if (isSelected(o)) return false
  if (o.disabled) return true
  return props.choice.count > 1 && filled.value >= props.choice.count
}
</script>

<template>
  <div class="slot" :class="status.cls" :data-slot="choice.key" data-testid="choice-slot">
    <div class="head">
      <strong class="label">{{ choice.label }}</strong>
      <span class="status" :data-status="status.cls">{{ status.text }}</span>
      <OriginChip v-if="showOrigin" :origin="choice.origin" />
    </div>
    <ul v-if="choice.warnings.length" class="warnings">
      <li v-for="w in choice.warnings" :key="w">⚠ {{ w }}</li>
    </ul>

    <!-- 屬性 +2/+1：每個位置一個下拉選單 -->
    <div v-if="choice.type === 'abilityWeighted'" class="weighted">
      <label v-for="(w, i) in choice.weights" :key="i">
        +{{ w }}
        <select :value="choice.selected[i] ?? ''" @change="setWeighted(i, ($event.target as HTMLSelectElement).value)">
          <option value="">（未選）</option>
          <option
            v-for="o in choice.options"
            :key="o.value"
            :value="o.value"
            :disabled="choice.selected.includes(o.value) && choice.selected[i] !== o.value"
          >
            {{ o.label }}
          </option>
        </select>
      </label>
    </div>

    <!-- 已選完的長清單：收合成摘要 -->
    <div v-else-if="collapsed" class="summary">
      <span v-for="l in selectedLabels" :key="l" class="picked">{{ l }}</span>
      <button type="button" class="edit" data-testid="slot-edit" @click="editing = true">修改</button>
    </div>

    <!-- 有條目的選項：可搜尋清單，點名稱展開說明 -->
    <template v-else-if="hasEntries">
      <button v-if="editing" type="button" class="edit" @click="editing = false">收合</button>
      <input v-if="choice.options.length > 8" v-model="query" class="search" type="search" placeholder="搜尋（中文或英文）" />
      <ul class="entries">
        <li v-for="o in shown" :key="o.value" :class="{ sel: isSelected(o), off: blocked(o) }">
          <div class="row">
            <input
              :type="choice.count === 1 ? 'radio' : 'checkbox'"
              :checked="isSelected(o)"
              :disabled="blocked(o)"
              :name="choice.key"
              :data-value="o.value"
              @change="toggle(o)"
            />
            <button type="button" class="name" @click="openId = openId === o.value ? null : o.value">
              {{ o.label }}
            </button>
            <span v-if="o.note" class="note" :class="{ tce: o.note.includes('TCE') }">{{ o.note }}</span>
            <span v-if="o.disabled && !isSelected(o)" class="disabled">{{ o.disabled }}</span>
            <span v-if="o.entry && filter.superseded(o.entry)" class="legacy">已有 2024 版</span>
            <SourceBadge v-if="o.entry" :source="o.entry.source" :page="o.entry.page" />
          </div>
          <div v-if="openId === o.value && o.entry" class="detail">
            <EntryBlock v-if="o.entry.entries" :entry="o.entry.entries" />
          </div>
        </li>
      </ul>
      <p v-if="!choice.options.length" class="muted">目前書目下沒有可選項目。</p>
    </template>

    <!-- 一般選項：按鈕 -->
    <div v-else class="chips">
      <button
        v-for="o in choice.options"
        :key="o.value"
        type="button"
        class="chip"
        :class="{ sel: isSelected(o) }"
        :disabled="blocked(o)"
        :title="o.disabled ?? o.note ?? ''"
        :data-value="o.value"
        @click="toggle(o)"
      >
        {{ o.label }}<small v-if="o.note && !isSelected(o)" class="chip-note">・{{ o.note }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.slot {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-surface);
  margin-bottom: var(--space-2);
}
.slot.part {
  border-left-color: var(--color-dice);
}
.slot.done {
  border-left-color: var(--color-tce);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.status {
  font-size: 0.8rem;
}
.status[data-status='none'] {
  color: var(--color-danger);
}
.status[data-status='part'] {
  color: var(--color-dice);
}
.status[data-status='done'] {
  color: var(--color-tce);
}
.warnings {
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
  color: var(--color-dice);
  font-size: 0.85rem;
}
.weighted {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
select,
.search {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.search {
  width: 100%;
  margin-bottom: var(--space-2);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.chip {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.chip.sel {
  border-color: var(--color-accent);
  background: var(--color-surface-raised);
  color: var(--color-accent);
}
.chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.chip-note {
  color: var(--color-text-muted);
}
.entries {
  max-height: 420px;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.entries li {
  border-bottom: 1px solid var(--color-border);
}
.entries li.sel {
  background: var(--color-surface-raised);
}
.entries li.off {
  opacity: 0.55;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}
.name {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  padding: 0;
}
.name:hover {
  color: var(--color-accent);
}
.note,
.disabled,
.legacy {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.note.tce {
  color: var(--color-tce);
}
.disabled {
  color: var(--color-danger);
}
.legacy {
  color: var(--color-legacy);
}
.detail {
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg);
  font-size: 0.9rem;
}
.muted {
  color: var(--color-text-muted);
}
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}
.picked {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
  color: var(--color-accent);
  font-size: 0.9rem;
}
.edit {
  padding: 0 var(--space-2);
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}
</style>
