<script setup lang="ts">
// 渲染 5etools 的 entries 結構（字串、entries、list、table、inset…）。
// 結構可以無限巢狀，所以元件會遞迴使用自己（<EntryBlock>）。
// 支援的 type 見 docs/data-notes.md §8；不認得的 type 會盡量顯示其中的 entries，並警告一次。
import { computed } from 'vue'
import { describeTag, type TagView } from '@/data/tags'
import EntryLink from './EntryLink.vue'
import RichText from './RichText.vue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type E = any

const props = withDefaults(defineProps<{ entry: unknown; depth?: number }>(), { depth: 0 })

const ABILITY: Record<string, string> = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }
const CONTAINER = new Set(['entries', 'section', 'variant', 'variantInner', 'variantSub', 'inset', 'insetReadaloud'])
const KNOWN = new Set([
  ...CONTAINER,
  'list',
  'item',
  'itemSub',
  'itemSpell',
  'table',
  'quote',
  'options',
  'refClassFeature',
  'refSubclassFeature',
  'refOptionalfeature',
  'refFeat',
  'statblock',
  'inline',
  'inlineBlock',
  'link',
  'image',
  'gallery',
  'bonus',
  'bonusSpeed',
  'abilityDc',
  'abilityAttackMod',
  'abilityGeneric',
  'dice',
  'hr',
  'cell',
  'wrapper',
])
const warned = new Set<string>()

const e = computed<E>(() => props.entry)
const type = computed<string | undefined>(() =>
  typeof e.value === 'object' && e.value && !Array.isArray(e.value) ? e.value.type ?? 'entries' : undefined,
)
const children = computed<unknown[]>(() => {
  const v = e.value
  if (Array.isArray(v)) return v
  if (!v || typeof v !== 'object') return []
  return [].concat(v.entries ?? v.entry ?? [])
})

/** 參照型 entry（refClassFeature 等）→ 借用標籤解析器得到連結。 */
const refLink = computed<Extract<TagView, { type: 'link' }> | undefined>(() => {
  const v = e.value
  const map: Record<string, [string, string]> = {
    refClassFeature: ['classFeature', 'classFeature'],
    refSubclassFeature: ['subclassFeature', 'subclassFeature'],
    refOptionalfeature: ['optfeature', 'optionalfeature'],
    refFeat: ['feat', 'feat'],
  }
  let view: TagView | undefined
  if (type.value === 'statblock') view = describeTag({ tag: v.tag, args: [v.name, v.source ?? ''], raw: '' })
  else if (type.value && map[type.value]) {
    const [tag, field] = map[type.value]!
    view = describeTag({ tag, args: String(v[field] ?? '').split('|'), raw: '' })
  }
  return view?.type === 'link' ? view : undefined
})

const abilityText = computed(() => {
  const attrs: string[] = (e.value?.attributes ?? []).map((a: string) => ABILITY[a] ?? a)
  return attrs.join('或')
})

function cellText(c: E): unknown {
  if (c && typeof c === 'object' && c.type === 'cell') {
    if (c.roll) return c.roll.exact !== undefined ? String(c.roll.exact) : `${c.roll.min}–${c.roll.max}`
    return c.entry ?? ''
  }
  return c
}

function diceText(v: E): string {
  return (v.toRoll ?? []).map((d: E) => `${d.number}d${d.faces}${d.modifier ? `+${d.modifier}` : ''}`).join('+')
}

if (type.value && !KNOWN.has(type.value) && !warned.has(type.value)) {
  warned.add(type.value)
  console.warn(`[EntryBlock] 未支援的 entry 類型 ${type.value}`)
}
</script>

<template>
  <!-- 字串 -->
  <p v-if="typeof entry === 'string'" class="p"><RichText :text="entry" /></p>

  <!-- 陣列 -->
  <template v-else-if="Array.isArray(entry)">
    <EntryBlock v-for="(c, i) in entry" :key="i" :entry="c" :depth="depth" />
  </template>

  <!-- 容器：entries / section / inset … -->
  <div v-else-if="type && CONTAINER.has(type)" :class="['block', { inset: type.startsWith('inset') }]">
    <component :is="depth === 0 ? 'h4' : 'h5'" v-if="e.name" class="title">
      <RichText :text="e.name" /><span v-if="e.ENG_name" class="eng">{{ e.ENG_name }}</span>
    </component>
    <EntryBlock v-for="(c, i) in children" :key="i" :entry="c" :depth="depth + 1" />
  </div>

  <!-- 清單 -->
  <ul v-else-if="type === 'list'" :class="['list', { hang: String(e.style ?? '').includes('hang') }]">
    <li v-for="(it, i) in e.items" :key="i">
      <RichText v-if="typeof it === 'string'" :text="it" />
      <EntryBlock v-else :entry="it" :depth="depth + 1" />
    </li>
  </ul>

  <!-- 清單項目：粗體名稱 + 內文 -->
  <div v-else-if="type === 'item' || type === 'itemSub' || type === 'itemSpell'" class="item">
    <span v-if="e.name" class="item-name"><RichText :text="e.name" /></span>
    <template v-for="(c, i) in children" :key="i">
      <RichText v-if="typeof c === 'string'" :text="c" />
      <EntryBlock v-else :entry="c" :depth="depth + 1" />
    </template>
  </div>

  <!-- 表格 -->
  <div v-else-if="type === 'table'" class="table-wrap">
    <table>
      <caption v-if="e.caption"><RichText :text="e.caption" /></caption>
      <thead v-if="e.colLabels">
        <tr>
          <th v-for="(h, i) in e.colLabels" :key="i"><RichText :text="String(h)" /></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in e.rows" :key="r">
          <td v-for="(c, i) in Array.isArray(row) ? row : (row.row ?? [])" :key="i">
            <RichText v-if="typeof cellText(c) === 'string'" :text="cellText(c) as string" />
            <EntryBlock v-else :entry="cellText(c)" :depth="depth + 1" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 引文 -->
  <blockquote v-else-if="type === 'quote'" class="quote">
    <EntryBlock v-for="(c, i) in children" :key="i" :entry="c" :depth="depth + 1" />
    <footer v-if="e.by">— <RichText :text="e.by" /></footer>
  </blockquote>

  <!-- 選項（選 N 項） -->
  <div v-else-if="type === 'options'" class="block">
    <p v-if="e.count" class="muted">選擇 {{ e.count }} 項：</p>
    <ul class="list">
      <li v-for="(c, i) in children" :key="i"><EntryBlock :entry="c" :depth="depth + 1" /></li>
    </ul>
  </div>

  <!-- 參照其他條目 -->
  <span v-else-if="refLink" class="ref"><EntryLink :view="refLink" /></span>

  <!-- 行內 -->
  <span v-else-if="type === 'inline' || type === 'inlineBlock'">
    <template v-for="(c, i) in children" :key="i">
      <RichText v-if="typeof c === 'string'" :text="c" />
      <EntryBlock v-else :entry="c" :depth="depth + 1" />
    </template>
  </span>
  <span v-else-if="type === 'link'">{{ e.text }}</span>

  <!-- 數值 -->
  <span v-else-if="type === 'bonus'">{{ e.value >= 0 ? '+' : '' }}{{ e.value }}</span>
  <span v-else-if="type === 'bonusSpeed'">{{ e.value >= 0 ? '+' : '' }}{{ e.value }} 尺</span>
  <p v-else-if="type === 'abilityDc'" class="formula">
    <strong>{{ e.name }}豁免 DC</strong> = 8 + 熟练加值 + {{ abilityText }}调整值
  </p>
  <p v-else-if="type === 'abilityAttackMod'" class="formula">
    <strong>{{ e.name }}攻击加值</strong> = 熟练加值 + {{ abilityText }}调整值
  </p>
  <span v-else-if="type === 'dice'" class="dice">{{ diceText(e) }}</span>
  <hr v-else-if="type === 'hr'" />
  <template v-else-if="type === 'image' || type === 'gallery'" />

  <!-- 不認得的類型：盡量顯示內文 -->
  <div v-else class="block">
    <h5 v-if="e?.name" class="title"><RichText :text="e.name" /></h5>
    <EntryBlock v-for="(c, i) in children" :key="i" :entry="c" :depth="depth + 1" />
  </div>
</template>

<style scoped>
.p {
  margin: 0 0 var(--space-2);
}
.block {
  margin: 0 0 var(--space-2);
}
.inset {
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-accent);
  background: var(--color-surface-raised);
  border-radius: var(--radius);
}
.title {
  margin: var(--space-2) 0 var(--space-1);
  font-size: 1rem;
}
.eng {
  margin-left: var(--space-2);
  color: var(--color-text-muted);
  font-weight: 400;
  font-size: 0.85em;
}
.list {
  margin: 0 0 var(--space-2);
  padding-left: 1.4em;
}
.list.hang {
  list-style: none;
  padding-left: 0;
}
.item-name {
  font-weight: 700;
  margin-right: var(--space-1);
}
.item :deep(.p) {
  display: inline;
}
.table-wrap {
  overflow-x: auto;
  margin: 0 0 var(--space-2);
}
table {
  border-collapse: collapse;
  font-size: 0.9rem;
}
caption {
  text-align: left;
  font-weight: 700;
  padding-bottom: var(--space-1);
}
th,
td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--color-text-muted);
}
.quote {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-3);
  border-left: 3px solid var(--color-border);
  font-style: italic;
}
.muted {
  color: var(--color-text-muted);
  margin: 0;
}
.formula {
  margin: 0 0 var(--space-2);
  text-align: center;
}
.dice {
  color: var(--color-dice);
}
</style>
