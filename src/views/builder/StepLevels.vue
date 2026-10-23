<script setup lang="ts">
// 升級：一級一級列出「這一級獲得的特性」與「需要做的選擇」（子職、屬性值提升或專長、可選特性…）。
// 可以升起始職業，也可以兼職（檢查屬性條件）。每級 HP 取平均或擲骰（可重骰，保留紀錄）。
// M7-4：兼職入口原本是「下拉選單＋另一顆 +1 級按鈕」，選了不會有反應、原因被截斷在選項文字裡，
// 改成職業清單：每個職業一顆「＋1 級」，不能兼職的反灰並直接顯示原因。
import { computed, ref } from 'vue'
import SourceBadge from '@/components/SourceBadge.vue'
import LegacyHint from '@/components/LegacyHint.vue'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import ChoiceSlotView from '@/components/builder/ChoiceSlotView.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITIES, type Ability } from '@/rules/abilities'
import { rollDie } from '@/rules/dice'
import { canMulticlass, multiclassRequirement, requirementText } from '@/rules/multiclass'

const { data, store, build, sheet } = useCharacterBuild()
const filter = useSourceFilterStore()
const c = computed(() => store.current!)

const scores = computed(
  () => Object.fromEntries(ABILITIES.map((a) => [a, sheet.value?.abilities[a].score ?? 10])) as Record<Ability, number>,
)
const currentClasses = computed(() => build.value?.classes.map((i) => i.entry) ?? [])

/** 下一級可選的職業：已有的職業直接升；新職業要檢查兼職條件 */
const revealLegacy = ref(false)
const classSplit = computed(() => filter.legacySplit(data.value.list('class'), revealLegacy.value))
const classOptions = computed(() => {
  const own = new Set(currentClasses.value.map((e) => e.id))
  return data.value
    .list('class')
    .filter((e) => classSplit.value.shown.includes(e) || own.has(e.id))
    .map((e) => {
      const check = own.has(e.id) ? { ok: true, reasons: [] } : canMulticlass(e, currentClasses.value, scores.value)
      return { entry: e, own: own.has(e.id), ...check }
    })
    .sort((a, b) => Number(b.own) - Number(a.own) || (a.entry.engName ?? '').localeCompare(b.entry.engName ?? ''))
})
const target = ref(c.value.levels.length || 1)
/** 屬性值還沒分配完：兼職條件會用 10 判斷，要提醒 */
const scoresMissing = computed(() => Object.values(c.value.baseScores).some((v) => v === null))
const levelOf = (id: string) => build.value?.classes.find((i) => i.entry.id === id)?.level ?? 0

function addLevel(classId: string) {
  if (c.value.levels.length >= 20) return
  store.update((ch) => ch.levels.push({ classId, hp: { mode: 'average' } }))
  openLevels.value = new Set([c.value.levels.length])
}
function levelTo(n: number) {
  const id = c.value.levels[0]?.classId
  if (!id) return
  const want = Math.min(20, Math.max(1, n))
  store.update((ch) => {
    while (ch.levels.length < want) ch.levels.push({ classId: id, hp: { mode: 'average' } })
    if (ch.levels.length > want) ch.levels.splice(want)
  })
}
function removeLast() {
  if (c.value.levels.length > 1) store.update((ch) => ch.levels.pop())
}

function rollHp(i: number) {
  const row = sheet.value?.hp.levels[i]
  if (!row) return
  const r = rollDie(row.die)
  store.update((ch) => {
    ch.levels[i]!.hp = { mode: 'roll', roll: r }
    ch.rollLog.push({ kind: 'hp', label: `第 ${i + 1} 級 HP（d${row.die}）`, dice: [r], total: r, at: new Date().toISOString() })
  })
}
function useAverage(i: number) {
  store.update((ch) => (ch.levels[i]!.hp = { mode: 'average' }))
}
const hpRolls = (i: number) => c.value.rollLog.filter((r) => r.kind === 'hp' && r.label.startsWith(`第 ${i + 1} 級`))

/** 每一級：職業、該級特性、該級的選擇欄位 */
const rows = computed(() => {
  const b = build.value
  if (!b) return []
  const counts = new Map<string, number>()
  return c.value.levels.map((lv, i) => {
    const n = i + 1
    counts.set(lv.classId, (counts.get(lv.classId) ?? 0) + 1)
    const cls = data.value.get(lv.classId)
    return {
      n,
      cls,
      classLevel: counts.get(lv.classId)!,
      features: b.features.filter((f) => (f.category === 'class' || f.category === 'subclass' || f.category === 'feat' || f.category === 'optionalfeature') && f.origin.level === n && f.origin.type !== 'background'),
      slots: b.slots.filter((s) => s.step === 'levels' && s.origin.level === n),
      hp: sheet.value?.hp.levels[i],
    }
  })
})
const openLevels = ref(new Set<number>([c.value.levels.length]))
function toggle(n: number) {
  const s = new Set(openLevels.value)
  if (s.has(n)) s.delete(n)
  else s.add(n)
  openLevels.value = s
}
const pendingAt = (r: { slots: { done: boolean; warnings: string[] }[] }) => r.slots.filter((s) => !s.done || s.warnings.length).length
</script>

<template>
  <div class="step">
    <p v-if="!c.levels.length" class="muted">先在「職業」步驟選起始職業。</p>
    <template v-else>
      <section class="controls">
        <label>
          升到
          <input v-model.number="target" type="number" min="1" max="20" data-testid="level-target" />
          級
        </label>
        <button type="button" data-testid="level-to" @click="levelTo(target)">套用</button>
        <small class="muted">（只升起始職業 {{ currentClasses[0]?.name }}；兼職用下方清單）</small>
        <button type="button" :disabled="c.levels.length <= 1" data-testid="remove-level" @click="removeLast">移除第 {{ c.levels.length }} 級</button>
      </section>

      <details class="multiclass" data-testid="multiclass" :open="currentClasses.length > 1">
        <summary>新增一級／兼職（目前 {{ currentClasses.length }} 個職業）</summary>
        <p v-if="scoresMissing" class="warn" data-testid="mc-scores-missing">
          屬性值還沒分配完，未分配的屬性以 10 判斷兼職條件。請先到「屬性值」步驟。
        </p>
        <ul class="class-list">
          <li v-for="o in classOptions" :key="o.entry.id" :data-class="o.entry.id" :class="{ own: o.own, blocked: !o.ok }">
            <button type="button" :disabled="!o.ok || c.levels.length >= 20" data-testid="add-class" @click="addLevel(o.entry.id)">＋1 級</button>
            <strong>{{ o.entry.name }}</strong>
            <small class="muted">{{ o.entry.engName }}</small>
            <SourceBadge :source="o.entry.source" :page="o.entry.page" />
            <small v-if="o.own" class="own-lv">目前 {{ levelOf(o.entry.id) }} 級</small>
            <small v-else-if="o.ok" class="ok">可兼職：{{ requirementText(multiclassRequirement(o.entry), scores) }}</small>
            <small v-else class="reason" data-testid="mc-reason">{{ o.reasons.join('；') }}</small>
          </li>
        </ul>
        <LegacyHint v-model="revealLegacy" :hidden="classSplit.hidden" />
      </details>

      <section v-if="sheet" class="casting">
        <span>角色等級 {{ c.levels.length }}：</span>
        <span v-for="ci in build?.classes" :key="ci.entry.id" class="cls">
          {{ ci.entry.name }} {{ ci.level }}<template v-if="ci.subclass">（{{ ci.subclass.name }}）</template>
          <small class="muted">兼職條件：{{ requirementText(multiclassRequirement(ci.entry), scores) }}</small>
        </span>
        <span v-if="sheet.spellcasting.casterLevel" class="slots" data-testid="spell-slots">
          {{ sheet.spellcasting.multiclass ? `兼職施法者等級 ${sheet.spellcasting.casterLevel}` : '法術位' }}：
          {{ sheet.spellcasting.slots.map((n, i) => (n ? `${i + 1}環×${n}` : '')).filter(Boolean).join('、') }}
        </span>
        <span v-if="sheet.spellcasting.pact" class="slots">
          契約魔法（{{ sheet.spellcasting.pact.className }}）：{{ sheet.spellcasting.pact.level }}環×{{ sheet.spellcasting.pact.count }}
        </span>
      </section>

      <ol class="levels">
        <li v-for="r in rows" :key="r.n" :class="{ open: openLevels.has(r.n) }" :data-level="r.n">
          <button type="button" class="lv-head" @click="toggle(r.n)">
            <strong>第 {{ r.n }} 級</strong>
            <span>{{ r.cls?.name ?? '?' }} {{ r.classLevel }} 級</span>
            <span class="feat-names">{{ r.features.map((f) => f.entry.name).join('、') }}</span>
            <span v-if="pendingAt(r)" class="pending">{{ pendingAt(r) }} 項未選</span>
            <span v-if="r.hp" class="hp">HP +{{ Math.max(1, r.hp.value + (sheet?.hp.conMod ?? 0)) }}</span>
          </button>
          <div v-if="openLevels.has(r.n)" class="lv-body">
            <div v-if="r.hp" class="hp-row">
              生命骰 d{{ r.hp.die }}：
              <template v-if="r.n === 1">1 級取最大值 {{ r.hp.die }}</template>
              <template v-else>
                <button type="button" :class="{ sel: r.hp.mode === 'average' }" @click="useAverage(r.n - 1)">平均 {{ r.hp.die / 2 + 1 }}</button>
                <button type="button" :class="{ sel: r.hp.mode === 'roll' }" :data-testid="`roll-hp-${r.n}`" @click="rollHp(r.n - 1)">
                  {{ r.hp.mode === 'roll' ? `擲骰 ${r.hp.value}（重骰）` : '擲骰' }}
                </button>
                <small v-if="hpRolls(r.n - 1).length" class="muted">紀錄：{{ hpRolls(r.n - 1).map((x) => x.total).join('、') }}</small>
              </template>
              ＋體質調整值 {{ sheet?.hp.conMod }}
            </div>
            <ul class="features">
              <li v-for="f in r.features" :key="f.key">
                <span>{{ f.entry.name }}</span>
                <small class="muted">{{ f.entry.engName }}</small>
                <span v-if="f.entry.tceOptional" class="tce">TCE 可選規則</span>
                <small class="muted">{{ f.origin.name }}</small>
                <SourceBadge :source="f.entry.source" :page="f.entry.page" />
              </li>
            </ul>
            <ChoiceSlotView v-for="s in r.slots" :key="s.key" :choice="s" />
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.controls,
.casting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.multiclass {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.multiclass summary {
  cursor: pointer;
  font-weight: 600;
}
.class-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0;
  padding: 0;
  list-style: none;
}
.class-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.class-list li.blocked strong {
  color: var(--color-text-muted);
}
.own-lv {
  color: var(--color-accent);
}
.ok {
  color: var(--color-tce);
}
.reason,
.warn {
  color: var(--color-danger);
}
input,
select,
button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
}
input[type='number'] {
  width: 4em;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button.sel {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.cls {
  padding: 0 var(--space-2);
  border-left: 2px solid var(--color-accent);
}
.slots {
  color: var(--color-dice);
}
.levels {
  margin: 0;
  padding: 0;
  list-style: none;
}
.levels > li {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  margin-bottom: var(--space-1);
}
.lv-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  width: 100%;
  border: 0;
  background: var(--color-surface);
  text-align: left;
  padding: var(--space-2) var(--space-3);
}
.feat-names {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.pending {
  color: var(--color-danger);
  font-size: 0.85rem;
}
.hp {
  margin-left: auto;
  color: var(--color-tce);
}
.lv-body {
  padding: var(--space-2) var(--space-3);
}
.hp-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.features {
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
}
.features li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  padding: 2px 0;
}
.tce {
  color: var(--color-tce);
  font-size: 0.75rem;
}
.muted {
  color: var(--color-text-muted);
}
</style>
