<script setup lang="ts">
// 屬性總覽：固定在建角精靈側欄（窄螢幕時變成頂部橫條），每一步都看得到最新的六項屬性。
// - 剛變動的屬性短暫高亮並顯示差值（例如 +1），調整值有變時特別標示
// - 滑鼠移到數值上顯示明細（abilityBreakdown 的 text）
// - 有還沒分配的加值時顯示「尚有 +1 未分配」，點擊跳到對應步驟
// - 可收合；收合狀態是 UI 偏好，存在 localStorage，不進角色存檔
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCharacterBuild } from '@/composables/useCharacterBuild'
import { ABILITIES, ABILITY_NAME, formatMod, type Ability } from '@/rules/abilities'
import { abilityBreakdown } from '@/rules/abilityBreakdown'
import { wizardStepOf } from '@/views/builder/steps'

const emit = defineEmits<{ goto: [step: string] }>()
const { store, build } = useCharacterBuild()

const COLLAPSE_KEY = 'dnd2024.ui.abilityOverviewCollapsed'
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}
const collapsed = ref(loadCollapsed())
watch(collapsed, (v) => {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  } catch {
    // 存不了就只在這次有效
  }
})

const breakdown = computed(() => (store.current && build.value ? abilityBreakdown(store.current, build.value) : undefined))

// 變動高亮：記住上一次的值，有變就記下差值，2.5 秒後清掉。
// key 每次遞增，讓 Vue 重新建立元素、CSS 動畫重新播放。
interface Flash {
  delta: number
  modChanged: boolean
  key: number
}
const flash = ref<Partial<Record<Ability, Flash>>>({})
let seq = 0
const timers = new Map<Ability, ReturnType<typeof setTimeout>>()
let lastCharId: string | undefined
watch(
  () => (breakdown.value ? ABILITIES.map((a) => [breakdown.value!.abilities[a].score, breakdown.value!.abilities[a].mod] as const) : null),
  (now, before) => {
    // 換角色時不算「變動」
    const id = store.current?.id
    if (id !== lastCharId) {
      lastCharId = id
      return
    }
    if (!now || !before) return
    ABILITIES.forEach((a, i) => {
      const delta = now[i]![0] - before[i]![0]
      if (!delta) return
      flash.value = { ...flash.value, [a]: { delta, modChanged: now[i]![1] !== before[i]![1], key: ++seq } }
      clearTimeout(timers.get(a))
      timers.set(
        a,
        setTimeout(() => {
          const rest = { ...flash.value }
          delete rest[a]
          flash.value = rest
        }, 2500),
      )
    })
  },
)
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)))

const pendingTotal = computed(() => breakdown.value?.pending ?? [])
const tip = (a: Ability) => {
  const l = breakdown.value!.abilities[a]
  return [l.text, ...l.warnings.map((w) => `⚠ ${w}`)].join('\n')
}
</script>

<template>
  <section v-if="breakdown" class="overview" :class="{ collapsed }" data-testid="ability-overview">
    <button type="button" class="toggle" :aria-expanded="!collapsed" data-testid="ability-overview-toggle" @click="collapsed = !collapsed">
      屬性總覽 <span class="chev">{{ collapsed ? '▸' : '▾' }}</span>
    </button>
    <template v-if="!collapsed">
      <ul class="list">
        <li
          v-for="a in ABILITIES"
          :key="a"
          :data-ability="a"
          :class="{ warn: breakdown.abilities[a].warnings.length, over: breakdown.abilities[a].override !== undefined }"
          :title="tip(a)"
        >
          <span class="name">{{ ABILITY_NAME[a].zh }}</span>
          <strong class="score">{{ breakdown.abilities[a].score }}</strong>
          <span class="mod" :class="{ changed: flash[a]?.modChanged }">{{ formatMod(breakdown.abilities[a].mod) }}</span>
          <span v-if="flash[a]" :key="flash[a]!.key" class="delta" :class="{ neg: flash[a]!.delta < 0 }" data-testid="ability-delta">
            {{ flash[a]!.delta > 0 ? '+' : '' }}{{ flash[a]!.delta }}
          </span>
          <span v-if="breakdown.abilities[a].warnings.length" class="icon" aria-label="有警示">⚠</span>
        </li>
      </ul>
      <button
        v-for="p in pendingTotal"
        :key="p.slotKey"
        type="button"
        class="pending"
        data-testid="ability-pending"
        :title="`${p.origin.name}：${p.label}`"
        @click="emit('goto', wizardStepOf(p.step))"
      >
        {{ p.amount ? `尚有 +${p.amount} 未分配` : '尚有屬性加值未選方式' }}
      </button>
      <p v-for="w in breakdown.warnings" :key="w" class="global-warn">⚠ {{ w }}</p>
    </template>
  </section>
</template>

<style scoped>
.overview {
  margin-top: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.toggle {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.list {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}
.list li {
  display: grid;
  grid-template-columns: 2.5em 2em 2.2em 1fr;
  align-items: baseline;
  gap: var(--space-1);
  padding: 2px var(--space-1);
  border-radius: var(--radius);
  cursor: help;
}
.list li:hover {
  background: var(--color-surface-raised);
}
.name {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.score {
  text-align: right;
  font-size: 1.05rem;
}
.over .score {
  color: var(--color-accent);
  text-decoration: underline dotted;
}
.mod {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.mod.changed {
  color: var(--color-accent);
  font-weight: bold;
}
.delta {
  justify-self: start;
  padding: 0 4px;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-bg);
  font-size: 0.75rem;
  animation: pop 2.5s ease-out forwards;
}
.delta.neg {
  background: var(--color-danger);
  color: #fff;
}
.icon {
  color: var(--color-danger);
  font-size: 0.8rem;
}
.warn .name {
  color: var(--color-danger);
}
@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  10% {
    opacity: 1;
    transform: scale(1.15);
  }
  20% {
    transform: scale(1);
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
.pending {
  display: block;
  width: 100%;
  margin-top: var(--space-1);
  padding: 2px var(--space-1);
  border: 1px dashed var(--color-danger);
  border-radius: var(--radius);
  background: none;
  color: var(--color-danger);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.global-warn {
  margin: var(--space-1) 0 0;
  color: var(--color-danger);
  font-size: 0.8rem;
}

/* 窄螢幕：變成頂部橫條（BuilderView 把側欄改成上下排列） */
@media (max-width: 900px) {
  .overview {
    margin-top: 0;
  }
  .overview:not(.collapsed) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .toggle {
    width: auto;
    gap: var(--space-1);
  }
  .list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
  }
  .list li {
    grid-template-columns: auto auto auto auto;
  }
  .pending {
    width: auto;
    margin: 0;
  }
}
</style>
