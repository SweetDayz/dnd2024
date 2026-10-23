<script setup lang="ts">
// 角卡（M2e 會擴充成完整的 DDB 風格角卡）。目前顯示主要數值摘要。
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITIES, ABILITY_NAME, formatMod } from '@/rules/abilities'

const emit = defineEmits<{ edit: [] }>()
const { store, sheet, ready } = useCharacterBuild()
</script>

<template>
  <div class="sheet">
    <p v-if="!store.current" class="muted">還沒有角色。</p>
    <p v-else-if="!ready" class="muted">載入資料中…</p>
    <template v-else-if="sheet">
      <h2>{{ store.current.name || '（未命名）' }}</h2>
      <button type="button" @click="emit('edit')">回到建角</button>
      <ul>
        <li>等級 {{ sheet.level }}，熟練加值 {{ formatMod(sheet.profBonus) }}，HP {{ sheet.hp.max }}</li>
        <li v-for="a in ABILITIES" :key="a">{{ ABILITY_NAME[a].zh }} {{ sheet.abilities[a].score }}（{{ formatMod(sheet.abilities[a].mod) }}）</li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-text-muted);
}
</style>
