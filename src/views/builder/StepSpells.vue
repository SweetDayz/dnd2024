<script setup lang="ts">
// 法術：上方是各施法職業的施法數據；其他非法術的選擇欄位（例如施法屬性）照舊列出；
// 法術選擇本身（職業的戲法、法術書、準備法術，以及種族、專長給的法術）在 SpellPicker 的分頁表格裡選，
// 右側隨時顯示角色從所有來源學會的法術。
import SpellPicker from '@/components/spells/SpellPicker.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITY_NAME, formatMod } from '@/rules/abilities'
import SlotGroup from './SlotGroup.vue'

const { casting } = useCharacterBuild()
</script>

<template>
  <div class="step">
    <section v-if="casting.length" class="casting">
      <div v-for="c in casting" :key="c.casting.from.id" class="box">
        <strong>{{ c.casting.from.name }}</strong>
        <span>施法屬性 {{ ABILITY_NAME[c.ability].zh }}</span>
        <span>法術 DC <b data-testid="spell-dc">{{ c.dc }}</b></span>
        <span>法術攻擊 <b>{{ formatMod(c.attack) }}</b></span>
        <span>戲法 {{ c.casting.cantrips }}</span>
        <span v-if="c.casting.spellbook !== undefined">法術書 {{ c.casting.spellbook }}</span>
        <span v-if="c.casting.prepared !== undefined">準備 {{ c.casting.prepared }}</span>
        <span v-if="c.casting.known !== undefined">已知 {{ c.casting.known }}</span>
        <span>最高 {{ c.casting.maxSpellLevel }} 環</span>
      </div>
    </section>
    <p v-else class="muted">職業沒有施法能力；種族或專長給的法術仍會列在右側。</p>

    <SlotGroup step="spells" skip-spells />
    <SpellPicker />
  </div>
</template>

<style scoped>
.casting {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.box {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
b {
  color: var(--color-accent);
}
.muted {
  color: var(--color-text-muted);
}
</style>
