<script setup lang="ts">
// 法術詳情：完整內文、升環效果，以及「誰可以取得這道法術」（職業清單、子職、種族、背景、專長、其他特性）。
// 職業清單依目前書目與 TCE 開關；TCE 擴充法術表的職業另外標示。
import { computed } from 'vue'
import { tagLabel } from '@/data/spellFilter'
import { schoolName } from '@/data/summary'
import type { Entry, SpellClassRef, SpellOrigins } from '@/data/types'
import { castingTime, durationText, materialText, rangeText } from '@/rules/spells'
import { useSourceFilterStore } from '@/stores/sourceFilter'
import LegacyBadge from '../LegacyBadge.vue'
import SourceBadge from '../SourceBadge.vue'
import EntryBlock from '../entries/EntryBlock.vue'

const props = defineProps<{ spell: Entry; subclassName?: (key: string) => string | undefined }>()
const emit = defineEmits<{ jump: [newer: Entry] }>()
const filter = useSourceFilterStore()

const sp = computed(() => props.spell)
const dur = computed(() => durationText(sp.value))
const levelText = computed(() => (sp.value.level === 0 ? '戲法' : `${sp.value.level} 環`))

const classes = computed(() =>
  ((sp.value.classes as SpellClassRef[] | undefined) ?? [])
    .filter((c) => !c.definedIn || c.definedIn.some((s) => filter.enabledSet.has(s)))
    .filter((c) => filter.enabledSet.has(c.classSource))
    .map((c) => ({ label: tagLabel('class', `${c.className}|${c.classSource}`), tce: !!c.tceOptional, on: !c.tceOptional || filter.tceOptional })),
)

const ORIGIN_LABEL = { subclass: '子職', race: '種族', background: '背景', feat: '專長', optionalfeature: '其他選項／特性' } as const
const origins = computed(() => {
  const o = (sp.value.origins as SpellOrigins | undefined) ?? {}
  const out: { label: string; items: string[] }[] = []
  for (const k of Object.keys(ORIGIN_LABEL) as (keyof typeof ORIGIN_LABEL)[]) {
    // 只列出來源書已啟用的（子職看子職來源與職業來源）
    const items = (o[k] ?? [])
      .filter((v) => {
        const parts = v.split('|')
        return k === 'subclass' ? filter.enabledSet.has(parts[1]!) && filter.enabledSet.has(parts[3]!) : filter.enabledSet.has(parts[1]!)
      })
      .map((v) => tagLabel(k, v, props.subclassName))
    if (items.length) out.push({ label: ORIGIN_LABEL[k], items: [...new Set(items)] })
  }
  return out
})
</script>

<template>
  <article class="detail" data-testid="spell-detail" :data-spell-id="sp.id">
    <header>
      <h4>{{ sp.name }} <small class="muted">{{ sp.engName }}</small></h4>
      <SourceBadge :source="sp.source" :page="sp.page" />
      <LegacyBadge :entry="sp" @jump="(e: Entry) => emit('jump', e)" />
    </header>
    <p class="meta">
      {{ levelText }}・{{ schoolName(sp.school) }}<template v-if="(sp.meta as { ritual?: boolean })?.ritual">（儀式）</template>
      ｜施法時間 {{ castingTime(sp) }}｜射程 {{ rangeText(sp) }}｜持續 {{ dur.concentration ? '專注，' : '' }}{{ dur.text }}
    </p>
    <p v-if="materialText(sp)" class="muted">材料：{{ materialText(sp) }}</p>
    <EntryBlock v-if="sp.entries" :entry="sp.entries" />
    <EntryBlock v-if="sp.entriesHigherLevel" :entry="sp.entriesHigherLevel" />
    <dl class="who">
      <template v-if="classes.length">
        <dt>職業清單</dt>
        <dd>
          <span v-for="c in classes" :key="c.label + c.tce" class="item" :class="{ off: !c.on }">
            {{ c.label }}<small v-if="c.tce" class="tce" title="TCE 擴充法術表：要打開「TCE 可選規則」才會列入">TCE 可選規則</small>
          </span>
        </dd>
      </template>
      <template v-for="g in origins" :key="g.label">
        <dt>{{ g.label }}</dt>
        <dd>
          <span v-for="i in g.items" :key="i" class="item">{{ i }}</span>
        </dd>
      </template>
    </dl>
  </article>
</template>

<style scoped>
.detail {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
h4 {
  margin: 0;
  color: var(--color-accent);
}
.meta {
  margin: var(--space-1) 0;
  font-size: 0.85rem;
}
.who {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
  font-size: 0.85rem;
}
dt {
  color: var(--color-text-muted);
}
dd {
  margin: 0;
}
.item {
  display: inline-block;
  margin-right: var(--space-2);
}
.item.off {
  opacity: 0.5;
}
.tce {
  margin-left: var(--space-1);
  color: var(--color-tce);
}
.muted {
  color: var(--color-text-muted);
}
</style>
