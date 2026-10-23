<script setup lang="ts">
// 法術表（建角的法術步驟與角卡的法術分頁共用）：依環位分組，每列顯示施法時間、射程、命中或 DC、
// 效果（傷害隨戲法等級升階）、專注、儀式、成分、次數與來源特性。點一列展開原文與升環傷害。
import { computed, ref } from 'vue'
import type { SpellRow } from '@/rules/spells'
import { addDice } from '@/rules/spells'
import SourceBadge from './SourceBadge.vue'
import EntryBlock from './entries/EntryBlock.vue'

const props = defineProps<{ rows: SpellRow[]; slots?: number[]; pact?: { count: number; level: number } }>()
const open = ref<string | null>(null)

const groups = computed(() => {
  const m = new Map<number, SpellRow[]>()
  for (const r of props.rows) m.set(r.level, [...(m.get(r.level) ?? []), r])
  return [...m.entries()].sort((a, b) => a[0] - b[0])
})
const maxSlot = computed(() => {
  let m = props.pact?.level ?? 0
  props.slots?.forEach((n, i) => n > 0 && (m = Math.max(m, i + 1)))
  return m
})
function upcast(r: SpellRow) {
  if (!r.damage || !r.upcastStep || r.level === 0) return []
  const out: { slot: number; damage: string }[] = []
  for (let s = r.level + 1; s <= maxSlot.value; s++) out.push({ slot: s, damage: addDice(r.damage, r.upcastStep, s - r.level) })
  return out
}
const levelLabel = (l: number) => (l === 0 ? '戲法' : `${l} 環`)
const slotText = (l: number) => {
  const n = props.slots?.[l - 1]
  const parts: string[] = []
  if (n) parts.push(`法術位 ×${n}`)
  if (props.pact && props.pact.level === l) parts.push(`契約法術位 ×${props.pact.count}`)
  return parts.join('、')
}
</script>

<template>
  <div class="spells" data-testid="spell-table">
    <section v-for="[lv, list] in groups" :key="lv">
      <h4>{{ levelLabel(lv) }} <small v-if="lv > 0 && slotText(lv)" class="muted">{{ slotText(lv) }}</small></h4>
      <table>
        <thead>
          <tr>
            <th>名稱</th>
            <th>來源</th>
            <th>時間</th>
            <th>射程</th>
            <th>命中／DC</th>
            <th>效果</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in list" :key="r.key">
            <tr :class="{ book: r.bookOnly }" :data-spell="r.spell.name" @click="open = open === r.key ? null : r.key">
              <td>
                <span class="name">{{ r.spell.name }}</span> <small class="muted">{{ r.spell.engName }}</small>
                <SourceBadge :source="r.spell.source" :page="r.spell.page" />
              </td>
              <td class="src">
                {{ r.sourceLabel }}
                <span v-if="r.bookOnly" class="tag">只在法術書</span>
                <span v-else-if="r.alwaysPrepared && r.level > 0" class="tag">永遠準備</span>
              </td>
              <td>{{ r.time }}</td>
              <td>{{ r.range }}</td>
              <td class="hit" data-col="hit">{{ r.hitDc }}</td>
              <td class="dmg">{{ r.damage ?? '' }}<span v-if="r.upcastStep && r.level > 0" title="可升環">*</span></td>
              <td class="notes">
                <span v-if="r.usesText" class="tag">{{ r.usesText }}</span>
                <span v-if="r.concentration" class="tag" title="專注">專注 {{ r.duration }}</span>
                <span v-else-if="r.duration && r.duration !== '立即'">{{ r.duration }}</span>
                <span v-if="r.ritual" class="tag" title="可儀式施展">儀式</span>
                <span :title="r.material">{{ r.components }}</span>
              </td>
            </tr>
            <tr v-if="open === r.key" class="detail">
              <td colspan="7">
                <p v-if="r.material" class="muted">材料：{{ r.material }}</p>
                <EntryBlock :entry="r.spell.entries" />
                <EntryBlock v-if="r.spell.entriesHigherLevel" :entry="r.spell.entriesHigherLevel" />
                <p v-if="upcast(r).length" class="upcast">
                  升環傷害：<span v-for="u in upcast(r)" :key="u.slot">{{ u.slot }} 環 {{ u.damage }}　</span>
                </p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
    <p v-if="!rows.length" class="muted">還沒有法術。</p>
  </div>
</template>

<style scoped>
h4 {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--color-accent);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th {
  text-align: left;
  font-weight: 500;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
th,
td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
tbody tr:not(.detail) {
  cursor: pointer;
}
tbody tr:not(.detail):hover {
  background: var(--color-surface);
}
tr.book {
  opacity: 0.65;
}
.name {
  font-weight: 600;
}
.hit {
  font-weight: 700;
  white-space: nowrap;
}
.dmg {
  color: var(--color-dice);
  white-space: nowrap;
}
.src {
  font-size: 0.8rem;
}
.notes {
  font-size: 0.8rem;
}
.tag {
  display: inline-block;
  margin-right: var(--space-1);
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 0.75rem;
}
.detail td {
  background: var(--color-surface);
}
.upcast {
  color: var(--color-dice);
}
.muted {
  color: var(--color-text-muted);
}
</style>
