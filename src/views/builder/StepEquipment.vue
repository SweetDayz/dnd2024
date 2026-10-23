<script setup lang="ts">
// 裝備：選起始裝備組（A/B，或改拿金幣），按「套用」放進物品欄；之後可以自由增減物品。
// 2014 職業的「改拿金幣」要擲骰（可重骰，保留紀錄）。下方即時顯示 AC 與攻擊列。
import { computed } from 'vue'
import AttackTable from '@/components/AttackTable.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { parseDice, rollExpr } from '@/rules/dice'
import { goldAlternative, startingInventory } from '@/rules/equipment'
import SlotGroup from './SlotGroup.vue'

const { data, store, build, sheet, attacks } = useCharacterBuild()
const c = computed(() => store.current!)

const primary = computed(() => build.value?.classes.find((i) => i.primary)?.entry)
const goldExpr = computed(() => (primary.value ? goldAlternative(primary.value) : undefined))
const goldKey = computed(() => `${primary.value?.id}:equip:gold`)
const goldPicked = computed(() => c.value.choices[goldKey.value]?.[0])
const goldRolls = computed(() => c.value.rollLog.filter((r) => r.kind === 'gold'))

function rollGold() {
  const expr = goldExpr.value ? parseDice(goldExpr.value) : undefined
  if (!expr) return
  const r = rollExpr(expr)
  store.update((ch) => {
    ch.rollLog.push({ kind: 'gold', label: `起始金幣（${goldExpr.value}）`, dice: r.dice, total: r.total, at: new Date().toISOString() })
    ch.choices[goldKey.value] = [String(r.total)]
  })
}
function useEquipment() {
  store.setChoice(goldKey.value, [])
}

const hasStart = computed(() => c.value.inventory.some((i) => i.from === 'start'))
const message = computed(() => {
  const missing = build.value?.slots.filter((s) => s.type === 'equipment' && !s.done) ?? []
  return missing.length ? `還有 ${missing.length} 組起始裝備沒選` : ''
})

function apply() {
  const b = build.value
  if (!b) return
  if (hasStart.value && !confirm('重新套用會取代先前套用的起始裝備與金錢（自己新增的物品會保留），確定嗎？')) return
  const sources = [primary.value, b.background]
    .filter((e) => !!e)
    .map((e) => {
      const picks: Record<number, string | undefined> = {}
      for (const [k, v] of Object.entries(c.value.choices)) {
        const m = new RegExp(`^${e!.id.replace(/[|()]/g, '\\$&')}:equip:(\\d+)$`).exec(k)
        if (m) picks[Number(m[1])] = v[0]
      }
      const gold = e === primary.value && goldPicked.value ? Number(goldPicked.value) : undefined
      return { entry: e!, picks, ...(gold !== undefined ? { gold } : {}) }
    })
  const { items, currency } = startingInventory(data.value, sources)
  store.update((ch) => {
    ch.inventory = [...ch.inventory.filter((i) => i.from !== 'start'), ...items]
    ch.currency = currency
  })
}
</script>

<template>
  <div class="step">
    <p class="muted">選擇職業與背景的起始裝備（B 通常是改拿金幣），再按「套用起始裝備」放進物品欄。</p>
    <div v-if="goldExpr" class="gold">
      <strong>{{ primary?.name }}：改拿金幣 {{ goldExpr }} GP</strong>
      <button type="button" data-testid="roll-gold" @click="rollGold">{{ goldPicked ? '重骰' : '擲骰' }}</button>
      <span v-if="goldPicked">目前 {{ goldPicked }} GP <button type="button" @click="useEquipment">改回拿裝備</button></span>
      <small v-if="goldRolls.length" class="muted">紀錄：{{ goldRolls.map((r) => `[${r.dice.join(',')}]→${r.total}`).join('、') }}</small>
    </div>
    <SlotGroup step="equipment" />
    <p>
      <button type="button" class="primary" data-testid="apply-equipment" @click="apply">套用起始裝備</button>
      <span v-if="message" class="warn">{{ message }}</span>
    </p>

    <section v-if="sheet" class="ac">
      <strong>AC <span data-testid="ac">{{ sheet.ac.value }}</span></strong>
      <small class="muted">= {{ sheet.ac.parts.map((p) => `${p.label} ${p.value}`).join(' + ') }}</small>
      <span v-for="w in sheet.ac.warnings" :key="w" class="warn">⚠ {{ w }}</span>
    </section>

    <h3>物品欄</h3>
    <InventoryPanel />

    <h3>攻擊</h3>
    <AttackTable :rows="attacks" show-actions />
  </div>
</template>

<style scoped>
.gold,
.ac {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
button {
  padding: 2px var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.primary {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.ac strong {
  font-size: 1.2rem;
}
.warn {
  color: var(--color-danger);
}
.muted {
  color: var(--color-text-muted);
}
</style>
