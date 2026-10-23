<script setup lang="ts">
// 第 5 步：屬性值。四種產生方式擇一（標準陣列／點數購買／4d6 去最低／自填），再加上背景的 +2/+1 或 +1/+1/+1。
// 自填：數字完全由玩家輸入（1～30），不檢查總和；審卡報告會在警示區提示 DM。
// 擲骰一律允許重骰，每次結果都記在 rollLog（存檔裡），可以展開查看。
import { computed } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import {
  ABILITIES,
  ABILITY_NAME,
  formatMod,
  isValidStandardArray,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuySpent,
  roll4d6DropLowest,
  STANDARD_ARRAY,
  type Ability,
} from '@/rules/abilities'
import { emptyScores, type AbilityMethod } from '@/rules/character'
import SlotGroup from './SlotGroup.vue'

const { store, sheet } = useCharacterBuild()
const c = computed(() => store.current!)

const METHODS: { id: AbilityMethod; label: string }[] = [
  { id: 'standard', label: '標準陣列' },
  { id: 'pointbuy', label: '點數購買' },
  { id: 'roll', label: '4d6 去最低' },
  { id: 'manual', label: '自填' },
]
/** 自填的範圍：D&D 屬性值上下限 */
const MANUAL_MIN = 1
const MANUAL_MAX = 30

function setMethod(m: AbilityMethod) {
  store.update((ch) => {
    ch.abilityMethod = m
    // 切到自填時保留目前的數字當起點；其他方法重新開始
    if (m !== 'manual') ch.baseScores = m === 'pointbuy' ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } : emptyScores()
  })
}

function setScore(a: Ability, v: string) {
  store.update((ch) => (ch.baseScores[a] = v === '' ? null : Number(v)))
}

// 自填：空白＝未填；超出 1～30 或不是整數就不存（輸入框會還原成原本的值）
function setManual(a: Ability, el: HTMLInputElement) {
  const raw = el.value.trim()
  const v = Number(raw)
  if (raw !== '' && (!Number.isInteger(v) || v < MANUAL_MIN || v > MANUAL_MAX)) {
    el.value = String(c.value.baseScores[a] ?? '')
    return
  }
  setScore(a, raw)
}

// 標準陣列：每個數字只能用一次
const usedElsewhere = (a: Ability, v: number) => ABILITIES.some((b) => b !== a && c.value.baseScores[b] === v)

// 點數購買
const spent = computed(() => pointBuySpent(c.value.baseScores))
function bump(a: Ability, d: number) {
  const cur = c.value.baseScores[a] ?? 8
  const next = cur + d
  if (next < 8 || next > 15) return
  const cost = (POINT_BUY_COST[next] ?? 0) - (POINT_BUY_COST[cur] ?? 0)
  if (spent.value + cost > POINT_BUY_BUDGET) return
  store.update((ch) => (ch.baseScores[a] = next))
}

// 4d6 去最低：擲 6 組，玩家把結果分配到六項屬性
function rollAll() {
  store.update((ch) => {
    const at = new Date().toISOString()
    const pool: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = roll4d6DropLowest()
      pool.push(r.total)
      ch.rollLog.push({ kind: 'ability', label: `屬性第 ${i + 1} 組（4d6 去最低）`, dice: r.dice, total: r.total, at })
    }
    ch.rolledPool = pool
    ch.baseScores = emptyScores()
  })
}
/** 某個擲骰結果還剩幾個可以分配（同一個數字可能擲出兩次） */
function poolLeft(a: Ability, v: number): boolean {
  const inPool = c.value.rolledPool.filter((x) => x === v).length
  const used = ABILITIES.filter((b) => b !== a && c.value.baseScores[b] === v).length
  return used < inPool
}
const poolValues = computed(() => [...new Set(c.value.rolledPool)].sort((a, b) => b - a))
const abilityRolls = computed(() => c.value.rollLog.filter((r) => r.kind === 'ability'))

const problems = computed(() => {
  const p: string[] = []
  const s = c.value.baseScores
  if (ABILITIES.some((a) => s[a] === null)) p.push('還有屬性沒有分配分數')
  else if (c.value.abilityMethod === 'standard' && !isValidStandardArray(s)) p.push('標準陣列的每個數字要恰好用一次')
  if (c.value.abilityMethod === 'pointbuy' && spent.value > POINT_BUY_BUDGET) p.push('點數超過 27')
  return p
})
</script>

<template>
  <div class="step">
    <div class="methods" role="tablist">
      <button
        v-for="m in METHODS"
        :key="m.id"
        type="button"
        role="tab"
        :aria-selected="c.abilityMethod === m.id"
        :class="{ active: c.abilityMethod === m.id }"
        :data-method="m.id"
        @click="setMethod(m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <p v-if="c.abilityMethod === 'standard'" class="muted">把 {{ STANDARD_ARRAY.join('、') }} 各分配給一項屬性。</p>
    <p v-else-if="c.abilityMethod === 'pointbuy'" class="muted">
      每項從 8 開始，最高 15；已用 <strong :class="{ over: spent > POINT_BUY_BUDGET }">{{ spent }}</strong>／{{ POINT_BUY_BUDGET }} 點。
    </p>
    <p v-else-if="c.abilityMethod === 'manual'" class="muted">
      直接輸入每項的基礎值（{{ MANUAL_MIN }}～{{ MANUAL_MAX }}），不檢查總和。審卡報告會註明屬性值為自填，請和 DM 確認。
    </p>
    <div v-else class="roll">
      <button type="button" class="primary" data-testid="roll-abilities" @click="rollAll">
        {{ c.rolledPool.length ? '重骰 6 組' : '擲 6 組 4d6（去最低）' }}
      </button>
      <span v-if="c.rolledPool.length" class="pool">結果：{{ c.rolledPool.join('、') }}</span>
      <details v-if="abilityRolls.length" class="log">
        <summary>擲骰紀錄（{{ abilityRolls.length }} 次）</summary>
        <ol>
          <li v-for="(r, i) in abilityRolls" :key="i">
            {{ r.label }}：[{{ r.dice.join(', ') }}] → {{ r.total }} <small class="muted">{{ r.at.slice(0, 19).replace('T', ' ') }}</small>
          </li>
        </ol>
      </details>
    </div>

    <table class="scores">
      <thead>
        <tr>
          <th>屬性</th>
          <th>基礎值</th>
          <th>加值</th>
          <th>最終</th>
          <th>調整值</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in ABILITIES" :key="a" :data-ability="a">
          <th>{{ ABILITY_NAME[a].zh }} <small class="muted">{{ ABILITY_NAME[a].abbr }}</small></th>
          <td>
            <select
              v-if="c.abilityMethod === 'standard'"
              :value="c.baseScores[a] ?? ''"
              @change="setScore(a, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">—</option>
              <option v-for="v in STANDARD_ARRAY" :key="v" :value="v" :disabled="usedElsewhere(a, v)">{{ v }}</option>
            </select>
            <span v-else-if="c.abilityMethod === 'pointbuy'" class="pb">
              <button type="button" @click="bump(a, -1)">−</button>
              <strong>{{ c.baseScores[a] ?? 8 }}</strong>
              <button type="button" @click="bump(a, 1)">＋</button>
            </span>
            <input
              v-else-if="c.abilityMethod === 'manual'"
              type="number"
              class="manual"
              :min="MANUAL_MIN"
              :max="MANUAL_MAX"
              step="1"
              :value="c.baseScores[a] ?? ''"
              data-testid="manual-score"
              @change="setManual(a, $event.target as HTMLInputElement)"
            />
            <select v-else :value="c.baseScores[a] ?? ''" :disabled="!c.rolledPool.length" @change="setScore(a, ($event.target as HTMLSelectElement).value)">
              <option value="">—</option>
              <option v-for="v in poolValues" :key="v" :value="v" :disabled="!poolLeft(a, v) && c.baseScores[a] !== v">{{ v }}</option>
            </select>
          </td>
          <td class="bonus">
            <template v-for="(b, i) in sheet?.abilities[a].bonuses ?? []" :key="i">
              <span :title="b.origin.name">+{{ b.amount }}（{{ b.origin.name }}）</span>
            </template>
          </td>
          <td class="final">{{ c.baseScores[a] === null ? '—' : sheet?.abilities[a].score }}</td>
          <td>{{ c.baseScores[a] === null ? '—' : formatMod(sheet?.abilities[a].mod ?? 0) }}</td>
        </tr>
      </tbody>
    </table>
    <ul v-if="problems.length" class="problems">
      <li v-for="p in problems" :key="p">⚠ {{ p }}</li>
    </ul>

    <h3>背景與專長的屬性加值</h3>
    <SlotGroup step="abilities" empty="先在「背景」步驟選一個背景。" />
  </div>
</template>

<style scoped>
.methods {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}
.methods button,
.roll button,
.pb button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.methods button.active,
.primary {
  border-color: var(--color-accent) !important;
  color: var(--color-accent);
}
.pb button {
  padding: 0 var(--space-2);
}
.manual {
  width: 4.5em;
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.pb {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.roll {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.log {
  flex-basis: 100%;
  font-size: 0.85rem;
}
.scores {
  border-collapse: collapse;
  margin: var(--space-2) 0;
}
.scores th,
.scores td {
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}
.final {
  font-weight: 700;
  font-size: 1.1rem;
}
.bonus {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
select {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.over,
.problems {
  color: var(--color-danger);
}
.problems {
  list-style: none;
  padding: 0;
}
.muted {
  color: var(--color-text-muted);
}
</style>
