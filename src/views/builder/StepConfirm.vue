<script setup lang="ts">
// 最後一步：命名、檢查還沒做的選擇與相容規則的說明，然後前往角卡。
import { computed } from 'vue'
import ChoiceSlotView from '@/components/builder/ChoiceSlotView.vue'
import OriginChip from '@/components/builder/OriginChip.vue'
import SourceBadge from '@/components/SourceBadge.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITIES, ABILITY_NAME, formatMod } from '@/rules/abilities'
import { pendingSlots } from '@/rules/build'
import { WIZARD_STEPS, wizardStepOf } from './steps'

const emit = defineEmits<{ goto: [step: string] }>()
const { store, build, sheet } = useCharacterBuild()

const pending = computed(() => (build.value ? pendingSlots(build.value) : []))
const stepLabel = (id: string) => WIZARD_STEPS.find((s) => s.id === id)?.label ?? id
const missing = computed(() => {
  const c = store.current
  const m: string[] = []
  if (!c?.levels.length) m.push('職業')
  if (!c?.backgroundId) m.push('背景')
  if (!c?.raceId) m.push('種族')
  if (c && Object.values(c.baseScores).some((v) => v === null)) m.push('屬性值')
  return m
})
</script>

<template>
  <div class="step">
    <label class="name">
      角色名稱
      <input
        :value="store.current?.name"
        type="text"
        placeholder="輸入名稱"
        data-testid="char-name"
        @input="store.update((c) => (c.name = ($event.target as HTMLInputElement).value))"
      />
    </label>

    <p v-if="missing.length" class="warn">⚠ 尚未選擇：{{ missing.join('、') }}</p>

    <section v-if="sheet" class="stats" data-testid="confirm-stats">
      <div><span>等級</span><strong>{{ sheet.level }}</strong></div>
      <div><span>熟練加值</span><strong>{{ formatMod(sheet.profBonus) }}</strong></div>
      <div><span>HP 上限</span><strong data-testid="hp-max">{{ sheet.hp.max }}</strong></div>
      <div><span>先攻</span><strong>{{ formatMod(sheet.initiative) }}</strong></div>
      <div><span>被動感知</span><strong>{{ sheet.passive.perception }}</strong></div>
      <div><span>速度</span><strong>{{ sheet.speeds.find((s) => s.mode === 'walk')?.value }} 呎</strong></div>
      <div v-for="a in ABILITIES" :key="a">
        <span>{{ ABILITY_NAME[a].zh }}</span><strong>{{ sheet.abilities[a].score }}（{{ formatMod(sheet.abilities[a].mod) }}）</strong>
      </div>
    </section>

    <h3>尚未完成的選擇（{{ pending.length }}）</h3>
    <div v-for="s in pending" :key="s.key" class="pending">
      <button type="button" class="goto" @click="emit('goto', wizardStepOf(s.step))">前往「{{ stepLabel(wizardStepOf(s.step)) }}」</button>
      <ChoiceSlotView :choice="s" />
    </div>
    <p v-if="!pending.length" class="ok">所有選擇都已完成。</p>

    <template v-if="build?.legacyPicks.length">
      <h3>已有新版的選擇（{{ build.legacyPicks.length }}）</h3>
      <p class="muted">這些項目在目前的書目下已被重印取代。存檔不會自動更換，要不要改用新版請和 DM 討論。</p>
      <ul class="notes" data-testid="legacy-picks">
        <li v-for="p in build.legacyPicks" :key="p.entry.id">
          ⚠ {{ p.entry.name }} <SourceBadge :source="p.entry.source" :page="p.entry.page" /> → 新版：{{ p.newer.name }}
          <SourceBadge :source="p.newer.source" :page="p.newer.page" />
        </li>
      </ul>
    </template>

    <template v-if="build?.notes.length">
      <h3>規則說明</h3>
      <ul class="notes">
        <li v-for="(n, i) in build.notes" :key="i">
          {{ n.text }} <OriginChip v-if="n.origin" :origin="n.origin" />
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}
.name input {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  min-width: 240px;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}
.stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 90px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.stats span {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.goto {
  border: 0;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  padding: 0;
}
.warn {
  color: var(--color-danger);
}
.ok {
  color: var(--color-tce);
}
.notes {
  padding-left: var(--space-3);
}
.muted {
  color: var(--color-text-muted);
}
</style>
