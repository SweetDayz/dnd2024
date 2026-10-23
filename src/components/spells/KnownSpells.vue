<script setup lang="ts">
// 右側「已學會的法術」（M9.md §2.4）：彙整角色所有來源的法術，**同一道法術合併成一列**。
// 每列的徽章依序列出每個來源（例如「法術書・死灵师」「永遠準備・魔宠密友」）與施放方式（「免費 1/長休」「儀式施放」）；
// 各來源的施法屬性不同時，點「▸」展開逐行顯示各來源的 DC、攻擊加值與次數。
// 在法術書裡但沒準備的法術歸在可收合的「僅在法術書」群組（灰色），每列有「準備」按鈕；已準備的法師法術有「取消準備」。
// 點法術名稱：右欄切換成詳情模式（由父元件處理）。
import { computed, ref } from 'vue'
import { ABILITY_NAME, formatMod, type Ability } from '@/rules/abilities'
import type { SpellGrant } from '@/rules/build'
import type { SpellRow, SpellVariant } from '@/rules/spells'
import { GRANT_KIND_LABEL, castModeLabel } from '@/rules/spells/grants'

const props = defineProps<{
  rows: SpellRow[]
  mods: Record<Ability, number>
  pb: number
  /** 法術書制的職業 id → 可以設為準備／取消準備（父元件判斷名額） */
  bookClasses: string[]
}>()
const emit = defineEmits<{ open: [row: SpellRow]; prepare: [row: SpellRow, classId: string]; unprepare: [row: SpellRow, classId: string] }>()

const groupBy = ref<'source' | 'level'>('source')
const bookOpen = ref(true)
const expanded = ref(new Set<string>())

const shortName = (g: SpellGrant) => g.origin.name.replace(/ \d+ 级$/, '').replace(/（.*）$/, '')

/** 來源徽章：「法術書・死灵师」「永遠準備・魔宠密友」「已準備・法师」 */
function sourceBadges(r: SpellRow): { text: string; cls: string; title?: string }[] {
  const out: { text: string; cls: string; title?: string }[] = []
  const seen = new Set<string>()
  for (const g of r.grants) {
    const kind = g.kind === 'spellbook' && g.free ? '法術書（免費）' : GRANT_KIND_LABEL[g.kind]
    const text = `${kind}・${shortName(g)}`
    if (seen.has(text)) continue
    seen.add(text)
    out.push({ text, cls: g.kind })
  }
  // 施放方式（法術位不另外標）
  const modes = new Set<string>()
  for (const g of r.grants) {
    for (const m of g.castModes) {
      if (m.type === 'slot' || m.type === 'pact') continue
      modes.add(castModeLabel(m, { pb: props.pb, mods: props.mods }))
    }
  }
  if (r.ritual && !modes.has('儀式施放') && !modes.has('只能以儀式施放') && r.grants.some((g) => g.kind === 'spellbook')) modes.add('儀式施放')
  for (const m of modes) out.push({ text: m, cls: m.includes('儀式') ? 'ritual' : 'free' })
  return out
}

/** 「感知豁免 DC 17」「命中 +9」 */
const hitText = (v: Pick<SpellVariant, 'hitDc' | 'attackBonus'>) => (v.attackBonus !== undefined ? `命中 ${formatMod(v.attackBonus)}` : v.hitDc !== '—' ? v.hitDc : '')
/** 各來源的屬性不同（才需要展開逐行） */
const differs = (r: SpellRow) => new Set(r.variants.map((v) => `${v.ability ?? ''}|${v.usesText ?? ''}`)).size > 1

/** 法師：這道法術在哪個法術書職業的書裡、是否已準備 */
function bookClass(r: SpellRow): string | undefined {
  for (const g of r.grants) {
    if (g.kind !== 'spellbook' && g.kind !== 'prepared') continue
    // 子職的免費抄寫：所屬職業 id 由子職條目的 className／classSource 組出
    const e = g.origin.entry
    const id = g.origin.type === 'class' ? e?.id : g.origin.type === 'subclass' && e ? `class|${e.className}|${e.classSource}` : undefined
    if (id && props.bookClasses.includes(id)) return id
  }
  return undefined
}
const isPreparedBook = (r: SpellRow) => r.grants.some((g) => g.kind === 'prepared') && !!bookClass(r)

const counts = computed(() => {
  const c = { cantrip: 0, prepared: 0, book: 0, innate: 0 }
  for (const r of props.rows) {
    const kinds = new Set(r.grants.map((g) => g.kind))
    if (r.level === 0) c.cantrip++
    else if (kinds.has('prepared') || kinds.has('known') || kinds.has('always') || kinds.has('arcanum')) c.prepared++
    else if (kinds.has('innate')) c.innate++
    if (kinds.has('spellbook')) c.book++
  }
  return c
})

interface Group {
  key: string
  title: string
  stats?: string
  rows: SpellRow[]
}
const mainRows = computed(() => props.rows.filter((r) => !r.bookOnly))
const bookRows = computed(() => props.rows.filter((r) => r.bookOnly))
const groups = computed<Group[]>(() => {
  const m = new Map<string, Group>()
  for (const r of mainRows.value) {
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
        stats = `${ABILITY_NAME[r.ability].zh}・法術 DC ${8 + props.pb + mod}・攻擊 ${formatMod(props.pb + mod)}`
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

function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}
</script>

<template>
  <aside class="known" data-testid="known-spells">
    <div class="head">
      <strong>已學會的法術</strong>
      <div class="switch" role="group" aria-label="分組方式">
        <button type="button" :class="{ on: groupBy === 'source' }" data-group-by="source" @click="groupBy = 'source'">依來源</button>
        <button type="button" :class="{ on: groupBy === 'level' }" data-group-by="level" @click="groupBy = 'level'">依環位</button>
      </div>
    </div>
    <p class="counts muted" data-testid="known-counts">
      戲法 {{ counts.cantrip }} · 準備 {{ counts.prepared }}<template v-if="counts.book"> · 法術書 {{ counts.book }}</template><template v-if="counts.innate"> · 天生 {{ counts.innate }}</template>
    </p>

    <section v-for="g in groups" :key="g.key" class="group">
      <h5>
        {{ g.title }}<small v-if="g.stats" class="stats" data-testid="known-stats">{{ g.stats }}</small>
      </h5>
      <ul>
        <li v-for="r in g.rows" :key="r.spell.id" :data-spell="r.spell.name" :data-known-group="'main'">
          <span class="lv">{{ r.level === 0 ? '戲' : r.level }}</span>
          <button type="button" class="name" :title="`${r.spell.name} ${r.spell.engName ?? ''}（點擊看詳情）`" @click="emit('open', r)">{{ r.spell.name }}</button>
          <span class="hit" data-col="hit">{{ hitText(r) }}</span>
          <span class="tags">
            <span v-for="t in sourceBadges(r)" :key="t.text" class="tag" :class="t.cls" data-testid="known-badge">{{ t.text }}</span>
            <button v-if="differs(r)" type="button" class="more" :title="'各來源的 DC、攻擊加值與次數'" @click="toggleExpand(r.spell.id)">
              {{ expanded.has(r.spell.id) ? '▾' : '▸' }} 各來源
            </button>
            <button v-if="isPreparedBook(r)" type="button" class="act" data-action="unprepare" @click="emit('unprepare', r, bookClass(r)!)">取消準備</button>
          </span>
          <ul v-if="expanded.has(r.spell.id)" class="variants">
            <li v-for="v in r.variants" :key="v.grant.key">
              {{ v.sourceLabel }}：<template v-if="v.ability">{{ ABILITY_NAME[v.ability].zh }} </template>{{ hitText(v) }}<template v-if="v.usesText">・{{ v.usesText }}</template>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="bookRows.length" class="group book" data-testid="known-book-only">
      <h5>
        <button type="button" class="fold" @click="bookOpen = !bookOpen">{{ bookOpen ? '▾' : '▸' }} 僅在法術書（{{ bookRows.length }}）</button>
      </h5>
      <ul v-show="bookOpen">
        <li v-for="r in bookRows" :key="r.spell.id" :data-spell="r.spell.name" data-known-group="book">
          <span class="lv">{{ r.level }}</span>
          <button type="button" class="name" @click="emit('open', r)">{{ r.spell.name }}</button>
          <button v-if="bookClass(r)" type="button" class="act" data-action="prepare" @click="emit('prepare', r, bookClass(r)!)">準備</button>
          <span class="tags">
            <span v-for="t in sourceBadges(r)" :key="t.text" class="tag" :class="t.cls">{{ t.text }}</span>
          </span>
        </li>
      </ul>
    </section>
    <p v-if="!rows.length" class="muted">還沒有法術。</p>
  </aside>
</template>

<style scoped>
.known {
  font-size: 0.85rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.counts {
  margin: var(--space-1) 0 0;
  font-size: 0.8rem;
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
}
.book li {
  opacity: 0.65;
}
.lv {
  color: var(--color-text-muted);
}
.name {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.name:hover {
  text-decoration: underline;
}
.hit {
  color: var(--color-dice);
  white-space: nowrap;
}
.tags,
.variants {
  grid-column: 2 / -1;
}
.variants li {
  display: block;
  border: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
.tag {
  display: inline-block;
  margin: 0 2px 2px 0;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: 0.7rem;
}
.tag.prepared,
.tag.always,
.tag.known,
.tag.arcanum {
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
.more,
.act,
.fold {
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.act {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.book .act {
  opacity: 1;
}
.fold {
  border: 0;
  color: var(--color-accent);
  font-size: 0.85rem;
  font-weight: 700;
}
.muted {
  color: var(--color-text-muted);
}
</style>
