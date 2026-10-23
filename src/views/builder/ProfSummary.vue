<script setup lang="ts">
// 熟練總覽：合併所有來源，每項列出來自哪裡。同一項有兩個來源時標示「重複」。
import { computed } from 'vue'
import OriginChip from '@/components/builder/OriginChip.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { formatMod } from '@/rules/abilities'

const props = defineProps<{ kinds: ('skill' | 'save' | 'tool' | 'weapon' | 'armor' | 'language')[] }>()
const { sheet } = useCharacterBuild()

const TITLE = { skill: '技能', save: '豁免', tool: '工具', weapon: '武器', armor: '護甲', language: '語言' }
const groups = computed(() => {
  const s = sheet.value
  if (!s) return []
  return props.kinds.map((k) => {
    if (k === 'skill')
      return {
        k,
        rows: s.skills
          .filter((x) => x.prof)
          .map((x) => ({ label: `${x.name} (${x.engName})${x.prof === 2 ? '・專精' : ''} ${formatMod(x.mod)}`, sources: x.sources })),
      }
    if (k === 'save')
      return {
        k,
        rows: Object.values(s.saves)
          .filter((x) => x.proficient)
          .map((x) => ({ label: `${x.ability.toUpperCase()} ${formatMod(x.mod)}`, sources: x.sources })),
      }
    return { k, rows: s.profs[k].map((r) => ({ label: r.legacy ? `${r.label}【2014 版】` : r.label, sources: r.sources })) }
  })
})
</script>

<template>
  <div class="summary">
    <section v-for="g in groups" :key="g.k">
      <h4>{{ TITLE[g.k] }}</h4>
      <ul>
        <li v-for="r in g.rows" :key="r.label">
          <span class="label">{{ r.label }}</span>
          <span v-if="r.sources.length > 1" class="dup">重複</span>
          <OriginChip v-for="(o, i) in r.sources" :key="i" :origin="o" />
        </li>
        <li v-if="!g.rows.length" class="muted">（無）</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-3);
}
h4 {
  margin: 0 0 var(--space-1);
  color: var(--color-accent);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  padding: 2px 0;
  border-bottom: 1px solid var(--color-border);
}
.dup {
  color: var(--color-dice);
  font-size: 0.75rem;
}
.muted {
  color: var(--color-text-muted);
}
</style>
