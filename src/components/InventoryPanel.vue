<script setup lang="ts">
// 物品欄：數量、重量、裝備中（護甲與盾牌影響 AC、武器出現在攻擊列）、同調（需要同調的魔法物品）、放身上或背包、金錢、負重。
// 建角的裝備步驟與角卡的物品分頁共用。
import { computed, ref } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import type { Currency, InventoryItem } from '@/rules/character'
import { itemWeight } from '@/rules/equipment'
import { entryMatches } from '@/data/sourceDisplay'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import LegacyBadge from './LegacyBadge.vue'
import LegacyHint from './LegacyHint.vue'
import SourceBadge from './SourceBadge.vue'

const { data, store, sheet } = useCharacterBuild()
const c = computed(() => store.current!)
const query = ref('')

const rows = computed(() =>
  c.value.inventory.map((i) => {
    const it = i.itemId ? data.value.get(i.itemId) : undefined
    return { inv: i, it, name: i.name ?? it?.name ?? '（自訂物品）', weight: itemWeight(data.value, i) }
  }),
)
const groups = computed(() => [
  { id: 'equipment' as const, label: '身上', rows: rows.value.filter((r) => r.inv.container === 'equipment') },
  { id: 'backpack' as const, label: '背包', rows: rows.value.filter((r) => r.inv.container === 'backpack') },
])
const groupWeight = (list: { weight: number }[]) => Math.round(list.reduce((s, r) => s + r.weight, 0) * 100) / 100

const filter = useSourceFilterStore()
const revealLegacy = ref(false)
const matchSplit = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return { shown: [], hidden: 0 }
  return filter.legacySplit(
    data.value.list('item').filter((it) => entryMatches(it, q)),
    revealLegacy.value,
  )
})
const matches = computed(() => matchSplit.value.shown.slice(0, 20))

function edit(uid: string, fn: (i: InventoryItem) => void) {
  store.update((ch) => {
    const i = ch.inventory.find((x) => x.uid === uid)
    if (i) fn(i)
  })
}
function add(itemId: string) {
  store.update((ch) =>
    ch.inventory.push({ uid: `i${Date.now().toString(36)}${ch.inventory.length}`, itemId, qty: 1, equipped: false, container: 'equipment' }),
  )
  query.value = ''
}
function addCustom() {
  const name = query.value.trim()
  if (!name) return
  store.update((ch) => ch.inventory.push({ uid: `i${Date.now().toString(36)}`, itemId: '', name, qty: 1, equipped: false, container: 'equipment' }))
  query.value = ''
}
function remove(uid: string) {
  store.update((ch) => (ch.inventory = ch.inventory.filter((x) => x.uid !== uid)))
}
const COINS: (keyof Currency)[] = ['pp', 'gp', 'ep', 'sp', 'cp']
const isEquippable = (it: unknown) => {
  const e = it as { weapon?: boolean; armor?: boolean; type?: string } | undefined
  return !!(e?.weapon || e?.armor || String(e?.type ?? '').split('|')[0] === 'S' || (e as { bonusAc?: unknown })?.bonusAc)
}
</script>

<template>
  <div class="inventory" data-testid="inventory">
    <p v-if="sheet" class="summary">
      攜帶 <strong data-testid="carried">{{ sheet.encumbrance.carried }}</strong> 磅／負重上限 {{ sheet.encumbrance.capacity }} 磅
      <small class="muted">（推拉舉 {{ sheet.encumbrance.dragLift }} 磅；硬幣另計 {{ sheet.encumbrance.coins }} 磅）</small>
      <span v-if="sheet.encumbrance.carried > sheet.encumbrance.capacity" class="warn">超過負重上限</span>
    </p>

    <section v-for="g in groups" :key="g.id">
      <h4>{{ g.label }}（{{ g.rows.length }}）<small class="muted">{{ groupWeight(g.rows) }} 磅</small></h4>
      <table>
        <thead>
          <tr>
            <th title="裝備中">裝備</th>
            <th title="已同調（只有需要同調的魔法物品可勾）">同調</th>
            <th>名稱</th>
            <th>數量</th>
            <th>重量</th>
            <th>位置</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in g.rows" :key="r.inv.uid" :data-item="r.name">
            <td>
              <input
                v-if="isEquippable(r.it)"
                type="checkbox"
                :checked="r.inv.equipped"
                @change="edit(r.inv.uid, (i) => (i.equipped = ($event.target as HTMLInputElement).checked))"
              />
            </td>
            <td>
              <input
                v-if="r.it?.reqAttune"
                type="checkbox"
                data-attune
                :title="typeof r.it.reqAttune === 'string' ? `需同調（${r.it.reqAttune}）` : '需同調'"
                :checked="!!r.inv.attuned"
                @change="edit(r.inv.uid, (i) => (i.attuned = ($event.target as HTMLInputElement).checked))"
              />
            </td>
            <td>
              {{ r.name }} <small class="muted">{{ r.it?.engName }}</small>
              <SourceBadge v-if="r.it" :source="r.it.source" :page="r.it.page" />
              <LegacyBadge v-if="r.it" :entry="r.it" @jump="(n) => (query = n.name)" />
            </td>
            <td>
              <input
                class="qty"
                type="number"
                min="0"
                :value="r.inv.qty"
                @change="edit(r.inv.uid, (i) => (i.qty = Math.max(0, Number(($event.target as HTMLInputElement).value))))"
              />
            </td>
            <td>{{ r.weight || '—' }}</td>
            <td>
              <select
                :value="r.inv.container"
                @change="edit(r.inv.uid, (i) => (i.container = ($event.target as HTMLSelectElement).value as InventoryItem['container']))"
              >
                <option value="equipment">身上</option>
                <option value="backpack">背包</option>
              </select>
            </td>
            <td><button type="button" class="del" title="移除" @click="remove(r.inv.uid)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="add">
      <input v-model="query" type="search" placeholder="新增物品：輸入名稱搜尋（中文或英文）" data-testid="item-search" />
      <button type="button" :disabled="!query.trim()" @click="addCustom">新增為自訂物品</button>
    </div>
    <LegacyHint v-model="revealLegacy" :hidden="matchSplit.hidden" />
    <ul v-if="matches.length" class="matches">
      <li v-for="it in matches" :key="it.id">
        <button type="button" :data-id="it.id" @click="add(it.id)">
          {{ it.name }} <small class="muted">{{ it.engName }}</small>
          <SourceBadge :source="it.source" :page="it.page" />
          <LegacyBadge :entry="it" @jump="(n) => (query = n.name)" />
        </button>
      </li>
    </ul>

    <h4>金錢</h4>
    <div class="coins">
      <label v-for="k in COINS" :key="k">
        {{ k.toUpperCase() }}
        <input
          type="number"
          min="0"
          :value="c.currency[k]"
          :data-coin="k"
          @change="store.update((ch) => (ch.currency[k] = Math.max(0, Number(($event.target as HTMLInputElement).value))))"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th {
  text-align: left;
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
th,
td {
  padding: 2px var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
h4 {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--color-accent);
}
input,
select,
button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.qty {
  width: 4.5em;
}
.del {
  border: 0;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}
.add {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.add input {
  flex: 1;
}
.matches {
  margin: var(--space-1) 0;
  padding: 0;
  list-style: none;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.matches button {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  text-align: left;
  cursor: pointer;
}
.coins {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.coins input {
  width: 6em;
}
.warn {
  color: var(--color-danger);
}
.muted {
  color: var(--color-text-muted);
}
</style>
