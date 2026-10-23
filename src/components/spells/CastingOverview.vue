<script setup lang="ts">
// 施法總覽（M9.md §2.1）：每個施法職業一張卡（施法屬性、法術 DC、攻擊加值、戲法／準備／法術書數、最高環位），
// 一列法術位（兼職時用合併後的施法者等級），魔契師另一列契約法術位，以及「其他來源」卡（種族、專長、祈喚…各自的屬性與 DC）。
// 存檔 DC 一律寫成「法術 DC 17」，避免和「感知 17」這種屬性值混淆。
import { computed } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITY_NAME, formatMod } from '@/rules/abilities'
import { otherSpellSources } from '@/rules/spells'

const { casting, sheet, spells, mods } = useCharacterBuild()

const slots = computed(() => sheet.value?.spellcasting)
const slotText = computed(() =>
  (slots.value?.slots ?? [])
    .map((n, i) => ({ lv: i + 1, n }))
    .filter((x) => x.n > 0),
)
const others = computed(() => (sheet.value ? otherSpellSources(spells.value, mods.value, sheet.value.profBonus) : []))
const ORIGIN = { race: '種族', background: '背景', feat: '專長', optionalfeature: '可選特性', rule: '規則', class: '職業', subclass: '子職' } as const
</script>

<template>
  <section class="overview" data-testid="casting-overview">
    <div class="cards">
      <div v-for="c in casting" :key="c.casting.from.id" class="card" :data-casting-card="c.casting.info.entry.id">
        <strong>{{ c.casting.from.name }} {{ c.casting.info.level }}</strong>
        <span>施法屬性 {{ ABILITY_NAME[c.ability].zh }}</span>
        <span>法術 DC <b data-testid="spell-dc">{{ c.dc }}</b></span>
        <span>法術攻擊 <b>{{ formatMod(c.attack) }}</b></span>
        <span>戲法 {{ c.casting.cantrips }}</span>
        <span v-if="c.casting.spellbook !== undefined">法術書 {{ c.casting.spellbook }}</span>
        <span v-if="c.casting.prepared !== undefined">準備 {{ c.casting.prepared }}</span>
        <span v-if="c.casting.known !== undefined">已知 {{ c.casting.known }}</span>
        <span>最高 {{ c.casting.maxSpellLevel }} 環</span>
      </div>
      <div v-if="others.length" class="card other" data-testid="other-sources">
        <strong>其他來源</strong>
        <span v-for="o in others" :key="o.key" class="src" :data-other-source="o.label">
          {{ o.label }}<small class="muted">（{{ ORIGIN[o.type] }}）</small>
          <template v-if="o.ability">{{ ABILITY_NAME[o.ability].zh }}・法術 DC <b>{{ o.dc }}</b>・攻擊 <b>{{ formatMod(o.attack!) }}</b></template>
          <small v-else class="muted">（施法屬性未選擇）</small>
        </span>
      </div>
    </div>
    <p v-if="slots && (slotText.length || slots.pact)" class="slots" data-testid="spell-slot-row">
      <template v-if="slotText.length">
        <strong>法術位</strong><small class="muted">（施法者等級 {{ slots.casterLevel }}）</small>
        <span v-for="s in slotText" :key="s.lv" class="slot" :data-slot-level="s.lv">{{ s.lv }}環 <b>{{ s.n }}</b></span>
      </template>
      <template v-if="slots.pact">
        <strong class="pact">契約法術位</strong>
        <span class="slot" data-testid="pact-slots">{{ slots.pact.count }} 個・{{ slots.pact.level }} 環</span>
      </template>
    </p>
  </section>
</template>

<style scoped>
.overview {
  margin-bottom: var(--space-3);
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.card {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.card.other {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
}
.src {
  font-size: 0.9rem;
}
b {
  color: var(--color-accent);
}
.slots {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  margin: var(--space-2) 0 0;
}
.slot {
  padding: 0 var(--space-2);
  border-left: 1px solid var(--color-border);
}
.pact {
  margin-left: var(--space-3);
}
.muted {
  color: var(--color-text-muted);
}
</style>
