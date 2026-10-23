<script setup lang="ts" generic="G extends string">
// 通用三態篩選面板（仿上游 5etools；M5 的法術篩選面板在 M7-6 抽成通用元件，法術、語言、物品共用）。
// 每個群組一列標籤，點標籤循環「包含（藍）→ 排除（紅）→ 不篩選」；每個群組可以切換 AND／OR，並有「全選」「清除」「預設」。
// 這個元件不自己存狀態：收到目前的 state，改動時 emit 新的 state，由父元件決定存到哪裡（偏好 store）。
// `generic="G extends string"`：群組 id 的型別由使用的地方決定（例如 SpellGroupId），TypeScript 會幫忙檢查。
// 預設 slot 放在群組之後，給「價值範圍」這類不是標籤的篩選用。
import {
  activeCount,
  clearGroup,
  cycleTag,
  selectAll,
  toggleMode,
  type FilterState,
  type GroupState,
} from '@/data/facetFilter'

const props = defineProps<{
  /** 群組（依顯示順序） */
  groups: readonly { id: G; label: string }[]
  state: FilterState<G>
  /** 各群組實際出現的標籤（空的群組不顯示） */
  tags: Partial<Record<G, string[]>>
  label: (group: G, value: string) => string
  /** 群組的預設值（「預設」按鈕用） */
  defaults: FilterState<G>
}>()
const emit = defineEmits<{ update: [state: FilterState<G>] }>()

function set(group: G, g: GroupState | undefined) {
  const next = { ...props.state }
  if (g && (Object.keys(g.tags).length || g.mode === 'and')) next[group] = g
  else delete next[group]
  emit('update', next)
}

const tagState = (group: G, tag: string) => props.state[group]?.tags[tag]
</script>

<template>
  <div class="panel" data-testid="filter-panel">
    <template v-for="{ id, label: groupLabel } in groups" :key="id">
      <div v-if="tags[id]?.length" class="group" :data-group="id">
        <div class="ghead">
          <strong>{{ groupLabel }}</strong>
          <span v-if="activeCount(state[id])" class="count">{{ activeCount(state[id]) }}</span>
          <button
            type="button"
            class="mode"
            :title="state[id]?.mode === 'and' ? 'AND：要符合全部「包含」的標籤' : 'OR：符合任一個「包含」的標籤即可'"
            :data-mode="state[id]?.mode ?? 'or'"
            @click="set(id, toggleMode(state[id]))"
          >
            {{ state[id]?.mode === 'and' ? 'AND' : 'OR' }}
          </button>
          <button type="button" class="act" @click="set(id, selectAll(state[id], tags[id]!))">全選</button>
          <button type="button" class="act" @click="set(id, clearGroup(state[id]))">清除</button>
          <button type="button" class="act" @click="set(id, defaults[id])">預設</button>
        </div>
        <div class="tags">
          <button
            v-for="t in tags[id]"
            :key="t"
            type="button"
            class="tag"
            :class="{ inc: tagState(id, t) === 1, exc: tagState(id, t) === -1 }"
            :data-tag="t"
            :title="tagState(id, t) === 1 ? '包含（再點一下改為排除）' : tagState(id, t) === -1 ? '排除（再點一下取消）' : '點一下：包含'"
            @click="set(id, cycleTag(state[id], t))"
          >
            {{ label(id, t) }}
          </button>
        </div>
      </div>
    </template>
    <slot />
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  max-height: 420px;
  overflow-y: auto;
}
.ghead {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 0.85rem;
}
.ghead strong {
  margin-right: var(--space-1);
  color: var(--color-accent);
  font-weight: 500;
}
.count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-include);
  color: #fff;
  font-size: 0.7rem;
}
.mode,
.act {
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.mode[data-mode='and'] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-1);
}
.tag {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.tag.inc {
  border-color: var(--color-include);
  background: var(--color-include);
  color: #fff;
}
.tag.exc {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: #fff;
  text-decoration: line-through;
}
</style>
