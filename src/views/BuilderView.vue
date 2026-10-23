<script setup lang="ts">
// 建角精靈：左邊是步驟清單（顯示每步還有幾項未選），右邊是目前步驟的內容。
// 步驟元件用 <component :is> 動態切換。
import { computed, ref, type Component } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { pendingSlots } from '@/rules/build'
import StepAbilities from './builder/StepAbilities.vue'
import StepBackground from './builder/StepBackground.vue'
import StepClass from './builder/StepClass.vue'
import StepConfirm from './builder/StepConfirm.vue'
import StepLanguages from './builder/StepLanguages.vue'
import StepProficiencies from './builder/StepProficiencies.vue'
import StepRace from './builder/StepRace.vue'
import StepSources from './builder/StepSources.vue'
import { WIZARD_STEPS } from './builder/steps'

const emit = defineEmits<{ done: [] }>()
const COMPONENTS: Record<string, Component> = {
  sources: StepSources,
  class: StepClass,
  background: StepBackground,
  race: StepRace,
  abilities: StepAbilities,
  proficiencies: StepProficiencies,
  languages: StepLanguages,
  confirm: StepConfirm,
}

const { ready, build, store } = useCharacterBuild()
const stepId = ref('sources')
const index = computed(() => WIZARD_STEPS.findIndex((s) => s.id === stepId.value))

function pendingCount(slotStep?: string): number {
  if (!build.value || !slotStep) return 0
  return pendingSlots(build.value).filter((s) => s.step === slotStep).length
}
function go(d: number) {
  const next = WIZARD_STEPS[index.value + d]
  if (next) stepId.value = next.id
}
</script>

<template>
  <div class="builder">
    <nav class="steps" aria-label="建角步驟">
      <ol>
        <li v-for="(s, i) in WIZARD_STEPS" :key="s.id">
          <button type="button" :class="{ active: s.id === stepId }" :data-step="s.id" @click="stepId = s.id">
            <span class="no">{{ i + 1 }}</span>{{ s.label }}
            <span v-if="pendingCount(s.slotStep)" class="pending" :title="`${pendingCount(s.slotStep)} 項未選`">
              {{ pendingCount(s.slotStep) }}
            </span>
          </button>
        </li>
      </ol>
    </nav>
    <section class="content">
      <p v-if="!store.current" class="muted">先在上方建立或選擇一個角色。</p>
      <p v-else-if="!ready" class="muted" data-testid="builder-loading">載入資料中…</p>
      <template v-else>
        <h2>{{ WIZARD_STEPS[index]?.label }}</h2>
        <component :is="COMPONENTS[stepId]" @goto="(id: string) => (stepId = id)" />
        <div class="nav">
          <button v-if="index > 0" type="button" @click="go(-1)">← 上一步</button>
          <button v-if="index < WIZARD_STEPS.length - 1" type="button" class="next" data-testid="next-step" @click="go(1)">
            下一步 →
          </button>
          <button v-else type="button" class="next" data-testid="to-sheet" @click="emit('done')">前往角卡 →</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.builder {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-3);
}
.steps ol {
  margin: 0;
  padding: 0;
  list-style: none;
  position: sticky;
  top: var(--space-2);
}
.steps button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.steps button:hover {
  background: var(--color-surface);
}
.steps button.active {
  background: var(--color-surface-raised);
  color: var(--color-accent);
}
.no {
  display: inline-grid;
  place-items: center;
  width: 1.5em;
  height: 1.5em;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-size: 0.8rem;
}
.pending {
  margin-left: auto;
  min-width: 1.5em;
  padding: 0 var(--space-1);
  border-radius: 999px;
  background: var(--color-danger);
  color: #fff;
  font-size: 0.75rem;
  text-align: center;
}
.content {
  min-width: 0;
}
h2 {
  margin-top: 0;
}
.nav {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-4);
}
.nav button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.nav .next {
  margin-left: auto;
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.muted {
  color: var(--color-text-muted);
}
</style>
