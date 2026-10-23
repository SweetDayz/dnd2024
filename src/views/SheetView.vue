<script setup lang="ts">
// 角卡（深色、仿 DDB 版面）：頂部摘要、六屬性與豁免、技能，右側分頁（動作、法術、物品、特性與特質、背景、筆記、效果）。
// 所有數字都由規則引擎即時計算；✎ 可手動覆寫（標示「已覆寫」）；✦ 表示有相關效果段落，點擊跳到效果頁。
import { computed, provide, ref, watch } from 'vue'
import AttackTable from '@/components/AttackTable.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import SpellTable from '@/components/SpellTable.vue'
import BackgroundTab from '@/components/sheet/BackgroundTab.vue'
import EffectMark from '@/components/sheet/EffectMark.vue'
import EffectsTab from '@/components/sheet/EffectsTab.vue'
import ExportButton from '@/components/sheet/ExportButton.vue'
import FeaturesTab from '@/components/sheet/FeaturesTab.vue'
import OverrideValue from '@/components/sheet/OverrideValue.vue'
import ReviewReport from '@/components/sheet/ReviewReport.vue'
import { SHEET_CONTEXT } from '@/components/sheet/context'
import OriginChip from '@/components/builder/OriginChip.vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITIES, ABILITY_NAME, formatMod } from '@/rules/abilities'
import { pendingSlots, sizeLabel } from '@/rules/build'
import { SKILL_SORT_LABEL, sortSkills, type SkillSortMode } from '@/data/skillOrder'
import { skillDetail } from '@/rules/derive'
import { detectEffects } from '@/rules/effects'

const emit = defineEmits<{ edit: [] }>()
const { data, store, build, sheet, ready, spells, casting, attacks } = useCharacterBuild()

const TABS = [
  { id: 'actions', label: '動作' },
  { id: 'spells', label: '法術' },
  { id: 'inventory', label: '物品' },
  { id: 'features', label: '特性與特質' },
  { id: 'background', label: '背景' },
  { id: 'notes', label: '筆記' },
  { id: 'effects', label: '效果' },
] as const
type TabId = (typeof TABS)[number]['id']
const tab = ref<TabId>('actions')
const effectField = ref<string | null>(null)

const effects = computed(() => (build.value ? detectEffects(build.value, data.value) : []))
provide(SHEET_CONTEXT, {
  effects,
  showEffects(field: string) {
    effectField.value = field
    tab.value = 'effects'
  },
})

const pending = computed(() => (build.value ? pendingSlots(build.value).length : 0))
const classLine = computed(() =>
  (build.value?.classes ?? [])
    .map((i) => `${i.entry.name} ${i.level}${i.subclass ? `（${i.subclass.name}）` : ''}`)
    .join('／'),
)
const raceName = computed(() => build.value?.race?.name ?? '')
const walk = computed(() => sheet.value?.speeds.find((s) => s.mode === 'walk')?.value ?? 30)
const otherSpeeds = computed(() => sheet.value?.speeds.filter((s) => s.mode !== 'walk') ?? [])
const SPEED: Record<string, string> = { fly: '飛行', swim: '游泳', climb: '攀爬', burrow: '掘穴' }
const SENSE: Record<string, string> = { darkvision: '黑暗視覺', blindsight: '盲視', tremorsense: '震顫感知', truesight: '真實視覺' }
const DEF: Record<string, string> = { resist: '抗性', immune: '免疫', vulnerable: '易傷', conditionImmune: '狀態免疫' }

// 技能排序：UI 偏好，存在 localStorage，不進角色存檔
const SORT_KEY = 'dnd2024.ui.skillSort'
const SORT_MODES = Object.keys(SKILL_SORT_LABEL) as SkillSortMode[]
function loadSort(): SkillSortMode {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return SORT_MODES.includes(v as SkillSortMode) ? (v as SkillSortMode) : 'roll20'
  } catch {
    return 'roll20'
  }
}
const skillSort = ref<SkillSortMode>(loadSort())
watch(skillSort, (v) => {
  try {
    localStorage.setItem(SORT_KEY, v)
  } catch {
    // 存不了就只在這次有效
  }
})
const skillGroups = computed(() => (sheet.value ? sortSkills(sheet.value.skills, skillSort.value) : []))

/** 熟練程度的文字標籤（不只靠符號區分）：— 無、熟練、專精 */
const PROF_LABEL = ['—', '熟練', '專精'] as const
</script>

<template>
  <div class="sheet" data-testid="sheet">
    <p v-if="!store.current" class="muted">還沒有角色。</p>
    <p v-else-if="!ready || !sheet || !build" class="muted">載入資料中…</p>
    <template v-else>
      <header class="head">
        <div>
          <h2 data-testid="sheet-name">{{ store.current.name || '（未命名）' }}</h2>
          <p class="sub">
            {{ raceName }}<template v-if="build.background">｜{{ build.background.name }}</template>｜{{ classLine }}｜等級
            {{ sheet.level }}
          </p>
        </div>
        <div class="head-actions">
          <button v-if="pending" type="button" class="pending" @click="emit('edit')">還有 {{ pending }} 項未選擇 →</button>
          <ReviewReport />
          <ExportButton />
          <button type="button" class="edit" @click="emit('edit')">回到建角</button>
        </div>
      </header>

      <section class="strip">
        <div class="stat">
          <span>護甲等級 AC</span>
          <strong data-testid="sheet-ac"><OverrideValue k="ac" :value="sheet.ac.value" /><EffectMark field="ac" /></strong>
          <small :title="sheet.ac.parts.map((p) => `${p.label} ${p.value}`).join(' + ')">{{ sheet.ac.armor?.name ?? '無甲' }}{{ sheet.ac.shield ? '＋盾' : '' }}</small>
        </div>
        <div class="stat">
          <span>HP 上限</span>
          <strong data-testid="sheet-hp"><OverrideValue k="hpMax" :value="sheet.hp.max" /><EffectMark field="hp" /></strong>
          <small>生命骰 {{ sheet.hitDice.map((d) => `${d.count}d${d.die}`).join('+') }}</small>
        </div>
        <div class="stat">
          <span>速度</span>
          <strong><OverrideValue k="speed" :value="walk" suffix=" 呎" /><EffectMark field="speed" /></strong>
          <small v-if="otherSpeeds.length">{{ otherSpeeds.map((s) => `${SPEED[s.mode] ?? s.mode} ${s.value}`).join('、') }}</small>
        </div>
        <div class="stat">
          <span>熟練加值</span>
          <strong data-testid="sheet-pb"><OverrideValue k="profBonus" :value="sheet.profBonus" signed /></strong>
        </div>
        <div class="stat">
          <span>先攻</span>
          <strong data-testid="sheet-init"><OverrideValue k="initiative" :value="sheet.initiative" signed /><EffectMark field="initiative" /></strong>
        </div>
        <div class="stat">
          <span>被動感知</span>
          <strong data-testid="sheet-pp"><OverrideValue k="passivePerception" :value="sheet.passive.perception" /><EffectMark field="passive" /></strong>
        </div>
        <div v-for="cst in casting" :key="cst.casting.from.id" class="stat" :data-casting="cst.casting.from.id">
          <span>{{ cst.casting.from.name }}法術</span>
          <strong data-testid="sheet-dc">DC {{ cst.dc }}</strong>
          <small>攻擊 {{ formatMod(cst.attack) }}（{{ ABILITY_NAME[cst.ability].zh }}）</small>
        </div>
      </section>

      <div class="grid">
        <aside class="col">
          <section class="abilities">
            <div v-for="a in ABILITIES" :key="a" class="ability" :data-ability="a">
              <span class="abbr">{{ ABILITY_NAME[a].zh }}</span>
              <strong class="mod">{{ formatMod(sheet.abilities[a].mod) }}<EffectMark :field="`check:${a}`" /></strong>
              <span class="score"><OverrideValue :k="`ability:${a}`" :value="sheet.abilities[a].score" /></span>
            </div>
          </section>

          <section class="box">
            <h4>豁免</h4>
            <ul class="rows">
              <li v-for="a in ABILITIES" :key="a" :data-save="a">
                <span class="dot" :title="sheet.saves[a].proficient ? '熟練' : ''">{{ sheet.saves[a].proficient ? '●' : '○' }}</span>
                <span class="label">{{ ABILITY_NAME[a].zh }}</span>
                <OverrideValue :k="`save:${a}`" :value="sheet.saves[a].mod" signed />
                <EffectMark :field="`save:${a}`" />
              </li>
            </ul>
          </section>

          <section class="box">
            <h4>感官與防禦</h4>
            <p v-for="s in sheet.senses" :key="s.type">{{ SENSE[s.type] ?? s.type }} {{ s.range }} 呎 <EffectMark field="senses" /></p>
            <p>
              被動洞悉 <OverrideValue k="passiveInsight" :value="sheet.passive.insight" />、被動調查
              <OverrideValue k="passiveInvestigation" :value="sheet.passive.investigation" />
            </p>
            <p v-if="build.size">體型：{{ sizeLabel(build.size.value) }}</p>
            <p v-for="(d, i) in build.defenses" :key="i">{{ DEF[d.type] }}：{{ d.value }} <OriginChip :origin="d.origin" /></p>
          </section>

          <section class="box">
            <h4>熟練與語言</h4>
            <p><span class="muted">護甲</span> {{ sheet.profs.armor.map((p) => p.label).join('、') || '—' }}</p>
            <p><span class="muted">武器</span> {{ sheet.profs.weapon.map((p) => p.label).join('、') || '—' }}</p>
            <p><span class="muted">工具</span> {{ sheet.profs.tool.map((p) => p.label).join('、') || '—' }}</p>
            <p>
              <span class="muted">語言</span>
              {{ sheet.profs.language.map((p) => (p.legacy ? `${p.label}【2014 版】` : p.label)).join('、') || '—' }}
            </p>
          </section>
        </aside>

        <section class="col skills box">
          <div class="skills-head">
            <h4>技能</h4>
            <select v-model="skillSort" class="sort" data-testid="skill-sort" title="技能排序（只影響畫面，記在這台電腦）">
              <option v-for="m in SORT_MODES" :key="m" :value="m">{{ SKILL_SORT_LABEL[m] }}</option>
            </select>
          </div>
          <template v-for="g in skillGroups" :key="g.ability ?? 'all'">
            <h5 v-if="g.ability" class="group" :data-skill-group="g.ability">{{ ABILITY_NAME[g.ability].zh }}</h5>
            <ul class="rows">
              <li v-for="s in g.skills" :key="s.key" :data-skill="s.key">
                <span class="pf" :class="`p${s.prof}`" :data-prof="s.prof">{{ PROF_LABEL[s.prof] }}</span>
                <span v-if="!g.ability" class="ab">{{ ABILITY_NAME[s.ability].abbr }}</span>
                <span class="label">{{ s.name }} <small class="muted">{{ s.engName }}</small></span>
                <span class="val" :title="skillDetail(s, sheet.profBonus)" data-testid="skill-detail">
                  <OverrideValue :k="`skill:${s.key}`" :value="s.mod" signed />
                </span>
                <EffectMark :field="`skill:${s.key}`" />
              </li>
            </ul>
          </template>
          <p class="legend" data-testid="prof-legend">
            <span class="pf p0">—</span> 無熟練
            <span class="pf p1">熟練</span> 加熟練加值
            <span class="pf p2">專精</span> 加兩倍熟練加值
          </p>
        </section>

        <main class="tabs">
          <nav>
            <button
              v-for="t in TABS"
              :key="t.id"
              type="button"
              :class="{ active: tab === t.id }"
              :data-tab-sheet="t.id"
              @click="tab = t.id"
            >
              {{ t.label }}<template v-if="t.id === 'effects'">（{{ effects.length }}）</template>
            </button>
          </nav>
          <div class="panel">
            <AttackTable v-if="tab === 'actions'" :rows="attacks" show-actions />
            <template v-else-if="tab === 'spells'">
              <SpellTable :rows="spells" :slots="sheet.spellcasting.slots" :pact="sheet.spellcasting.pact" />
            </template>
            <InventoryPanel v-else-if="tab === 'inventory'" />
            <FeaturesTab v-else-if="tab === 'features'" />
            <BackgroundTab v-else-if="tab === 'background'" />
            <textarea
              v-else-if="tab === 'notes'"
              class="notes"
              rows="20"
              placeholder="筆記（組織、盟友、敵人、其他財物…）"
              :value="store.current.notes"
              @change="store.update((c) => (c.notes = ($event.target as HTMLTextAreaElement).value))"
            />
            <EffectsTab v-else :effects="effects" :field="effectField" @update:field="(f) => (effectField = f)" />
          </div>
        </main>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.head > div:first-child {
  min-width: 0;
}
h2 {
  margin: 0;
  color: var(--color-accent);
}
.sub {
  margin: 0;
  color: var(--color-text-muted);
}
.head button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}
.head .pending {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 110px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.stat > span {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.stat strong {
  font-size: 1.5rem;
}
.stat small {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.grid {
  display: grid;
  /* minmax(0, 1fr)：分頁欄的最小寬度不被內容（寬表格、長字串）撐開，避免出現水平捲軸 */
  grid-template-columns: 260px 280px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
}
/* 較窄的桌機：技能移到左欄（屬性、豁免下方），分頁欄更寬 */
@media (max-width: 1180px) {
  .grid {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .grid > .skills {
    grid-column: 1;
  }
  .grid > .tabs {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
.col {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.box {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  font-size: 0.9rem;
}
.box p {
  margin: 2px 0;
}
h4 {
  margin: 0 0 var(--space-1);
  color: var(--color-accent);
  font-size: 0.85rem;
}
.abilities {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}
.ability {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.ability .abbr {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.ability .mod {
  font-size: 1.4rem;
}
.ability .score {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.8rem;
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rows li {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: 2px 0;
  border-bottom: 1px solid var(--color-border);
}
.rows .label {
  flex: 1;
}
.dot {
  color: var(--color-accent);
  width: 1em;
}
.skills-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.skills-head h4 {
  margin: 0;
}
.sort {
  max-width: 150px;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font-size: 0.75rem;
}
.group {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
/* 熟練程度：文字＋不同形狀與顏色，不只靠 ○●◉ 區分 */
.pf {
  flex: none;
  display: inline-block;
  min-width: 2.6em;
  padding: 0 4px;
  font-size: 0.7rem;
  line-height: 1.5;
  text-align: center;
}
.pf.p0 {
  color: var(--color-text-muted);
}
.pf.p1 {
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-bg);
}
.pf.p2 {
  border: 1px solid var(--color-tce);
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-tce) 25%, transparent);
  color: var(--color-tce);
  font-weight: bold;
}
.val {
  cursor: help;
}
.ab {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  width: 2.5em;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
.tabs nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}
.tabs nav button {
  padding: var(--space-1) var(--space-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}
.tabs nav button.active {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent);
}
.panel {
  padding: var(--space-2) 0;
  min-width: 0;
  overflow-x: auto;
}
.notes {
  width: 100%;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.muted {
  color: var(--color-text-muted);
}
</style>
