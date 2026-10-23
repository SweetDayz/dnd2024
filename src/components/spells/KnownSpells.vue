<script setup lang="ts">
// 右側「已學會的法術」：彙整角色所有來源（職業、子職、種族、背景、專長、其他特性）的法術。
// 可依「來源」或「環階」分組；依來源分組時，每組標題顯示該來源的施法屬性、法術 DC、法術攻擊加值
// （例如種族法術可能用感知，職業法術用智力）。點一道法術，左側會切到對應的選擇欄位並顯示詳情。
import { computed, ref } from 'vue'
import { ABILITY_NAME, formatMod, type Ability } from '@/rules/abilities'
import type { SpellScope } from '@/rules/build'
import type { SpellRow } from '@/rules/spells'

const props = defineProps<{
  rows: SpellRow[]
  mods: Record<Ability, number>
  pb: number
  /** 選擇欄位 key → 法術欄位條件（判斷「已準備」「法術書」等狀態用） */
  scopes: Map<string, SpellScope>
}>()
const emit = defineEmits<{ locate: [row: SpellRow] }>()

const groupBy = ref<'source' | 'level'>('source')

/** 每道法術的狀態標籤 */
function tags(r: SpellRow): { text: string; cls: string; title?: string }[] {
  const out: { text: string; cls: string; title?: string }[] = []
  const role = r.grant.slotKey ? props.scopes.get(r.grant.slotKey)?.role : undefined
  if (r.level === 0) out.push({ text: '戲法', cls: 'cantrip' })
  // 法術書：只在書裡，或從法術書準備的（準備欄位的候選來自法術書）
  const inBook = r.bookOnly || (role === 'prepared' && !!props.scopes.get(r.grant.slotKey!)?.fromIds)
  if (inBook) out.push({ text: '法術書', cls: 'book' })
  if (r.level > 0 && r.grant.mode === 'class') out.push({ text: role === 'known' ? '已知' : '已準備', cls: 'prep' })
  if (r.level > 0 && r.alwaysPrepared) out.push({ text: '永遠準備', cls: 'always' })
  if (r.usesText) out.push({ text: `免費施放 ${r.usesText}`, cls: 'free', title: '不耗法術位的施展次數' })
  if (r.ritual) out.push({ text: '儀式施放', cls: 'ritual', title: inBook ? '法術書內的儀式法術不必準備就能以儀式施展' : '可以儀式施展（多花 10 分鐘，不耗法術位）' })
  return out
}

interface Group {
  key: string
  title: string
  stats?: string
  rows: SpellRow[]
}
const groups = computed<Group[]>(() => {
  const m = new Map<string, Group>()
  for (const r of props.rows) {
    let key: string
    let title: string
    let stats: string | undefined
    if (groupBy.value === 'level') {
      key = String(r.level)
      title = r.level === 0 ? '戲法' : `${r.level} 環`
    } else {
      key = `${r.grant.origin.entry?.id ?? r.grant.origin.name}|${r.ability ?? ''}`
      title = r.sourceLabel
      if (r.ability) {
        const mod = props.mods[r.ability]
        stats = `${ABILITY_NAME[r.ability].zh}・DC ${8 + props.pb + mod}・攻擊 ${formatMod(props.pb + mod)}`
      }
    }
    const g = m.get(key)
    if (g) g.rows.push(r)
    else m.set(key, { key, title, ...(stats ? { stats } : {}), rows: [r] })
  }
  const list = [...m.values()]
  if (groupBy.value === 'level') list.sort((a, b) => Number(a.key) - Number(b.key))
  return list
})
</script>

<template>
  <aside class="known" data-testid="known-spells">
    <div class="head">
      <strong>已學會的法術</strong>
      <span class="muted">{{ rows.length }} 道</span>
      <div class="switch" role="group" aria-label="分組方式">
        <button type="button" :class="{ on: groupBy === 'source' }" data-group-by="source" @click="groupBy = 'source'">依來源</button>
        <button type="button" :class="{ on: groupBy === 'level' }" data-group-by="level" @click="groupBy = 'level'">依環階</button>
      </div>
    </div>
    <section v-for="g in groups" :key="g.key" class="group">
      <h5>
        {{ g.title }}<small v-if="g.stats" class="stats" data-testid="known-stats">{{ g.stats }}</small>
      </h5>
      <ul>
        <li
          v-for="r in g.rows"
          :key="r.key"
          :data-spell="r.spell.name"
          :title="`${r.spell.name} ${r.spell.engName ?? ''}｜${r.sourceLabel}（點擊在左側定位）`"
          @click="emit('locate', r)"
        >
          <span class="lv">{{ r.level === 0 ? '戲' : r.level }}</span>
          <span class="name">{{ r.spell.name }}</span>
          <span class="hit" data-col="hit">{{ r.hitDc !== '—' ? r.hitDc : '' }}</span>
          <span class="tags">
            <span v-for="t in tags(r)" :key="t.text" class="tag" :class="t.cls" :title="t.title">{{ t.text }}</span>
            <span v-if="groupBy === 'level'" class="tag src">{{ r.sourceLabel }}</span>
          </span>
        </li>
      </ul>
    </section>
    <p v-if="!rows.length" class="muted">還沒有法術。</p>
  </aside>
</template>

<style scoped>
.known {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  font-size: 0.85rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.switch {
  margin-left: auto;
  display: inline-flex;
}
.switch button {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.switch button:first-child {
  border-radius: var(--radius) 0 0 var(--radius);
}
.switch button:last-child {
  border-radius: 0 var(--radius) var(--radius) 0;
}
.switch button.on {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
h5 {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--color-accent);
  font-size: 0.85rem;
}
.stats {
  display: block;
  color: var(--color-text-muted);
  font-weight: 400;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: grid;
  grid-template-columns: 1.5em minmax(0, 1fr) auto;
  gap: 0 var(--space-1);
  padding: 2px 0;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}
li:hover {
  background: var(--color-surface-raised);
}
.lv {
  color: var(--color-text-muted);
}
.name {
  font-weight: 600;
}
.hit {
  color: var(--color-dice);
  white-space: nowrap;
}
.tags {
  grid-column: 2 / -1;
}
.tag {
  display: inline-block;
  margin-right: 2px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 0.7rem;
}
.tag.prep,
.tag.always {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.tag.free {
  border-color: var(--color-dice);
  color: var(--color-dice);
}
.tag.ritual {
  border-color: var(--color-tce);
  color: var(--color-tce);
}
.muted {
  color: var(--color-text-muted);
}
</style>
