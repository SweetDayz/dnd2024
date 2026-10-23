<script setup lang="ts">
// 法術篩選面板（仿上游 5etools）：每個群組一列標籤，點標籤循環「包含（藍）→ 排除（紅）→ 不篩選」。
// 每個群組可以切換 AND／OR，並有「全選」「清除」「預設」。
// 這個元件不自己存狀態：收到目前的 state，改動時 emit 新的 state，由父元件決定存到哪裡（spellPrefs store）。
import {
  SPELL_GROUP_IDS,
  SPELL_GROUP_LABEL,
  activeCount,
  clearGroup,
  cycleTag,
  selectAll,
  toggleMode,
  type GroupState,
  type SpellFilterState,
  type SpellGroupId,
} from '@/data/spellFilter'

const props = defineProps<{
  state: SpellFilterState
  /** 各群組在候選範圍內出現的標籤（空的群組不顯示） */
  tags: Partial<Record<SpellGroupId, string[]>>
  label: (group: SpellGroupId, value: string) => string
  /** 群組的預設值（「預設」按鈕用） */
  defaults: SpellFilterState
}>()
const emit = defineEmits<{ update: [state: SpellFilterState] }>()

function set(group: SpellGroupId, g: GroupState | undefined) {
  const next = { ...props.state }
  if (g && (Object.keys(g.tags).length || g.mode === 'and')) next[group] = g
  else delete next[group]
  emit('update', next)
}

const tagState = (group: SpellGroupId, tag: string) => props.state[group]?.tags[tag]
</script>

<template>
  <div class="panel" data-testid="spell-filter-panel">
    <template v-for="id in SPELL_GROUP_IDS" :key="id">
      <div v-if="tags[id]?.length" class="group" :data-group="id">
        <div class="ghead">
          <strong>{{ SPELL_GROUP_LABEL[id] }}</strong>
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
