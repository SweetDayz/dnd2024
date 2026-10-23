<script setup lang="ts">
// 書目篩選面板：套用群組、目前啟用的書、兩個開關，以及（預覽中的）單本勾選。
import { computed, ref } from 'vue'
import { sourceAbbr, sourceMatches } from '@/data/sourceDisplay'
import { SOURCE_GROUPS } from '@/data/sourceGroups'
import type { SourceInfo } from '@/data/types'
import { useCatalogStore } from '@/stores/catalog'
import { useSourceFilterStore } from '@/stores/sourceFilter'

const filter = useSourceFilterStore()
const catalog = useCatalogStore()

const groups = Object.values(SOURCE_GROUPS)
const enabledBooks = computed(() => catalog.sources.filter((s) => filter.enabledSet.has(s.source)))
const groupLabel = computed(() => (filter.groupId ? SOURCE_GROUPS[filter.groupId]?.label : '自訂'))

// 書目搜尋：輸入縮寫（PHB24）或原始代碼（XPHB）完整比對，或中英文書名的一部分
const bookQuery = ref('')
const bookHit = (s: SourceInfo) => {
  const q = bookQuery.value.trim().toLowerCase()
  return !q || sourceMatches(s.source, q) || s.name.toLowerCase().includes(q) || s.engName.toLowerCase().includes(q)
}
const shownBooks = computed(() => catalog.sources.filter(bookHit))
</script>

<template>
  <section class="panel" data-testid="source-filter">
    <h2>書目</h2>

    <div class="groups">
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        :class="{ active: filter.groupId === g.id }"
        :title="g.description"
        @click="filter.applyGroup(g.id)"
      >
        套用「{{ g.label }}」
      </button>
    </div>
    <p class="muted">目前：{{ groupLabel }}，共 {{ enabledBooks.length }} 本</p>

    <label class="switch">
      <input v-model="filter.showLegacy" type="checkbox" data-testid="toggle-legacy" />
      顯示已被重印取代的版本
    </label>
    <label class="switch">
      <input v-model="filter.tceOptional" type="checkbox" data-testid="toggle-tce" />
      <span class="tce">TCE 可選規則</span>
      <small class="muted">（可選職業特性、定制血統、擴充法術表）</small>
    </label>

    <details class="books">
      <summary>已啟用的書目</summary>
      <ul>
        <li v-for="s in enabledBooks" :key="s.source">
          <code :title="s.source">{{ sourceAbbr(s.source) }}</code> {{ s.name }} <small class="muted">{{ s.engName }}</small>
        </li>
      </ul>
    </details>

    <!-- 單本勾選：之後的里程碑才正式開放，先收在這裡（預覽） -->
    <details class="books" data-testid="per-book">
      <summary>單本勾選（預覽）</summary>
      <input v-model="bookQuery" type="search" class="book-search" placeholder="搜尋書目（PHB24、XPHB、書名）" data-testid="book-search" />
      <ul>
        <li v-for="s in shownBooks" :key="s.source">
          <label>
            <input
              type="checkbox"
              :checked="filter.enabledSet.has(s.source)"
              :data-source="s.source"
              @change="filter.toggleSource(s.source, ($event.target as HTMLInputElement).checked)"
            />
            <code :title="s.source">{{ sourceAbbr(s.source) }}</code> {{ s.name }}
            <small class="muted"><template v-if="sourceAbbr(s.source) !== s.source">{{ s.source }}・</template>{{ s.edition }}・{{ s.type === 'book' ? '規則書' : '冒險' }}</small>
          </label>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
h2 {
  margin: 0;
  font-size: 1.1rem;
}
.groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;
}
button.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}
.tce {
  color: var(--color-tce);
}
.muted {
  margin: 0;
  color: var(--color-text-muted);
}
.books ul {
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
  max-height: 40vh;
  overflow-y: auto;
  font-size: 0.85rem;
}
.books summary {
  cursor: pointer;
  color: var(--color-text-muted);
}
code {
  color: var(--color-badge-text);
}
.book-search {
  width: 100%;
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: inherit;
}
</style>
