<script setup lang="ts">
// 背景分頁：背景原文、角色特徵欄位（陣營、身高、體重…）、個性特質／理想／羈絆／缺點。
// 身高體重：種族資料有表（2014 種族）才提供擲骰；個性等懶人表：背景資料有表（2014 背景）才提供擲骰。
// 擲骰一律可重骰，結果都記在擲骰紀錄。
import { computed } from 'vue'
import SourceBadge from '@/components/SourceBadge.vue'
import EntryBlock from '@/components/entries/EntryBlock.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { sizeLabel } from '@/rules/build'
import { rollDie } from '@/rules/dice'
import {
  inchesToText,
  rollHeightWeight,
  TRAIT_LABEL,
  traitTables,
  type HeightWeight,
  type TraitField,
} from '@/rules/sheetExtras'

const { data, store, build } = useCharacterBuild()
const c = computed(() => store.current!)
const bg = computed(() => build.value?.background)
const tables = computed(() => traitTables(bg.value))
const hw = computed(() => {
  const r = c.value.raceId ? data.value.get(c.value.raceId) : undefined
  return r?.heightAndWeight as HeightWeight | undefined
})

const FIELDS: { k: string; label: string }[] = [
  { k: 'alignment', label: '陣營' },
  { k: 'gender', label: '性別' },
  { k: 'eyes', label: '眼睛' },
  { k: 'height', label: '身高' },
  { k: 'faith', label: '信仰' },
  { k: 'hair', label: '頭髮' },
  { k: 'skin', label: '膚色' },
  { k: 'age', label: '年齡' },
  { k: 'weight', label: '體重' },
]
const TRAITS: TraitField[] = ['personality', 'ideals', 'bonds', 'flaws']

function set(k: string, v: string) {
  store.update((ch) => {
    if (v) ch.details[k] = v
    else delete ch.details[k]
  })
}
function rollHw() {
  if (!hw.value) return
  const r = rollHeightWeight(hw.value)
  store.update((ch) => {
    ch.details.height = inchesToText(r.height)
    ch.details.weight = `${r.weight} 磅`
    ch.rollLog.push({ kind: 'height', label: `身高體重（${hw.value!.heightMod ?? ''}／${hw.value!.weightMod ?? ''}）`, dice: r.dice, total: r.height, at: new Date().toISOString() })
  })
}
function rollTrait(f: TraitField) {
  const t = tables.value.find((x) => x.field === f)
  if (!t) return
  const n = rollDie(t.faces)
  const row = t.rows.find((r) => r.roll === String(n)) ?? t.rows[n - 1]
  if (!row) return
  store.update((ch) => {
    ch.details[f] = ch.details[f] ? `${ch.details[f]}\n${row.text}` : row.text
    ch.rollLog.push({ kind: 'table', label: `${t.label}（d${t.faces}）`, dice: [n], total: n, at: new Date().toISOString() })
  })
}
const hwRolls = computed(() => c.value.rollLog.filter((r) => r.kind === 'height'))
</script>

<template>
  <div class="bg">
    <section v-if="bg">
      <h3>
        {{ bg.name }} <small class="muted">{{ bg.engName }}</small> <SourceBadge :source="bg.source" :page="bg.page" />
      </h3>
      <EntryBlock v-if="bg.entries" :entry="bg.entries" />
    </section>
    <p v-else class="muted">還沒選背景。</p>

    <h3>特徵</h3>
    <div class="fields">
      <label v-for="f in FIELDS" :key="f.k">
        <span>{{ f.label }}</span>
        <input type="text" :value="c.details[f.k] ?? ''" :data-detail="f.k" @change="set(f.k, ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        <span>體型</span>
        <input type="text" :value="build?.size ? sizeLabel(build.size.value) : ''" disabled />
      </label>
    </div>
    <p class="hw">
      <button v-if="hw" type="button" data-testid="roll-hw" @click="rollHw">擲身高體重（{{ hwRolls.length ? '重骰' : '擲骰' }}）</button>
      <small v-else class="muted">2024 版種族沒有身高體重表，請自行填寫。</small>
      <small v-if="hwRolls.length" class="muted">紀錄：{{ hwRolls.map((r) => inchesToText(r.total)).join('、') }}</small>
    </p>

    <div class="traits">
      <label v-for="f in TRAITS" :key="f">
        <span>
          {{ TRAIT_LABEL[f] }}
          <button v-if="tables.some((t) => t.field === f)" type="button" :data-roll="f" @click="rollTrait(f)">
            擲 d{{ tables.find((t) => t.field === f)?.faces }}
          </button>
        </span>
        <textarea rows="3" :value="c.details[f] ?? ''" @change="set(f, ($event.target as HTMLTextAreaElement).value)" />
      </label>
      <label>
        <span>外貌</span>
        <textarea rows="3" :value="c.details.appearance ?? ''" @change="set('appearance', ($event.target as HTMLTextAreaElement).value)" />
      </label>
    </div>
    <p v-if="!tables.length" class="muted">這個背景的資料沒有個性懶人表（2024 版背景都沒有），請自行填寫。</p>
  </div>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-2);
}
label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
input,
textarea {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}
.traits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
}
button {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-accent);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.hw {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.muted {
  color: var(--color-text-muted);
}
</style>
