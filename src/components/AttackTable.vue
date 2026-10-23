<script setup lang="ts">
// 攻擊列（武器、徒手打擊、攻擊型法術）＋戰鬥中可用的動作清單（取自資料的 XPHB 動作）。
// 建角的裝備步驟與角卡的動作分頁共用。
import { computed, ref } from 'vue'
import { useRulesData } from '@/composables/useRulesData'
import { standardActions, type AttackRow } from '@/rules/equipment'
import SourceBadge from './SourceBadge.vue'
import EntryBlock from './entries/EntryBlock.vue'

defineProps<{ rows: AttackRow[]; showActions?: boolean }>()
const { data } = useRulesData()
const open = ref<string | null>(null)
const openAction = ref<string | null>(null)

/** 2024 規則的標準動作（資料有就用 XPHB 版） */
const actions = computed(() => standardActions(data.value))
</script>

<template>
  <div class="attacks">
    <table data-testid="attack-table">
      <thead>
        <tr>
          <th>攻擊</th>
          <th>射程</th>
          <th>命中／DC</th>
          <th>傷害</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="r in rows" :key="r.key">
          <tr :data-attack="r.name" @click="open = open === r.key ? null : r.key">
            <td>
              <span class="name">{{ r.name }}</span> <small class="muted">{{ r.engName }}</small>
              <div class="type">{{ r.typeLabel }}</div>
            </td>
            <td>{{ r.range }}</td>
            <td class="hit" data-col="hit">{{ r.hitDc }}</td>
            <td class="dmg">{{ r.damage }}</td>
            <td class="notes">{{ r.notes.join('、') }}</td>
          </tr>
          <tr v-if="open === r.key && (r.entry || r.mastery)" class="detail">
            <td colspan="5">
              <template v-if="r.entry">
                <SourceBadge :source="r.entry.source" :page="r.entry.page" />
                <EntryBlock v-if="r.entry.entries" :entry="r.entry.entries" />
              </template>
              <template v-if="r.mastery">
                <h5>精通：{{ r.mastery.name }} <SourceBadge :source="r.mastery.source" :page="r.mastery.page" /></h5>
                <EntryBlock :entry="r.mastery.entries" />
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <section v-if="showActions" class="actions">
      <h4>戰鬥中的動作</h4>
      <div class="chips">
        <button
          v-for="a in actions"
          :key="a.id"
          type="button"
          :class="{ sel: openAction === a.id }"
          @click="openAction = openAction === a.id ? null : a.id"
        >
          {{ a.name }}
        </button>
      </div>
      <template v-for="a in actions" :key="a.id">
        <div v-if="openAction === a.id" class="action-detail">
          <strong>{{ a.name }}</strong> <small class="muted">{{ a.engName }}</small>
          <SourceBadge :source="a.source" :page="a.page" />
          <EntryBlock :entry="a.entries" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th {
  text-align: left;
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
th,
td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
tbody tr:not(.detail) {
  cursor: pointer;
}
tbody tr:not(.detail):hover {
  background: var(--color-surface);
}
.name {
  font-weight: 600;
}
.type,
.notes {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.hit {
  font-weight: 700;
}
.dmg {
  color: var(--color-dice);
}
.detail td,
.action-detail {
  background: var(--color-surface);
  padding: var(--space-2) var(--space-3);
}
h4 {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--color-accent);
}
h5 {
  margin: var(--space-2) 0 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}
.chips button {
  padding: 2px var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.chips button.sel {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.muted {
  color: var(--color-text-muted);
}
</style>
