<script setup lang="ts">
// 最外層：頂部導覽（建立角色／角卡／資料瀏覽／致謝）＋角色工具列＋底部授權頁尾。
// 三個畫面用 v-if 切換；目前畫面記在 localStorage，重新開啟時回到原處。
import { onMounted, ref, watch } from 'vue'
import CharacterBar from '@/components/CharacterBar.vue'
import OptionBrowser from '@/components/browser/OptionBrowser.vue'
import SourceFilterPanel from '@/components/SourceFilterPanel.vue'
import { LICENSE_LINE } from '@/data/credits'
import { useCatalogStore } from '@/stores/catalog'
import { useCharacterStore } from '@/stores/character'
import BuilderView from '@/views/BuilderView.vue'
import CreditsView from '@/views/CreditsView.vue'
import SheetView from '@/views/SheetView.vue'

type View = 'builder' | 'sheet' | 'browser' | 'credits'
const VIEW_KEY = 'dnd2024.view'
const VIEWS: { id: View; label: string }[] = [
  { id: 'builder', label: '建立角色' },
  { id: 'sheet', label: '角卡' },
  { id: 'browser', label: '資料瀏覽' },
  { id: 'credits', label: '致謝' },
]

const catalog = useCatalogStore()
const characters = useCharacterStore()

function savedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.some((x) => x.id === v) ? (v as View) : 'builder'
  } catch {
    return 'builder'
  }
}
const view = ref<View>(savedView())
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // 存不了就算了
  }
})

onMounted(async () => {
  try {
    await catalog.loadSources()
  } catch (err) {
    catalog.errors.push(err instanceof Error ? err.message : String(err))
  }
  // 第一次使用：自動建立一個空白角色
  if (!characters.characters.length) characters.create()
  else if (!characters.current) characters.select(characters.characters[0]!.id)
})
</script>

<template>
  <div class="layout" :class="view">
    <header class="top">
      <h1>D&amp;D 2024 角色建立器</h1>
      <nav class="views">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          type="button"
          :class="{ active: view === v.id }"
          :data-view="v.id"
          @click="view = v.id"
        >
          {{ v.label }}
        </button>
      </nav>
      <CharacterBar v-if="view === 'builder' || view === 'sheet'" class="bar" />
    </header>
    <p v-for="e in catalog.errors" :key="e" class="error" data-testid="load-error">{{ e }}</p>
    <template v-if="view === 'browser'">
      <aside class="side">
        <SourceFilterPanel />
      </aside>
      <main class="main">
        <OptionBrowser />
      </main>
    </template>
    <main v-else class="main full">
      <BuilderView v-if="view === 'builder'" @done="view = 'sheet'" />
      <SheetView v-else-if="view === 'sheet'" @edit="view = 'builder'" />
      <CreditsView v-else />
    </main>
    <footer class="foot" data-testid="license-footer">
      {{ LICENSE_LINE }}｜<a href="#" data-testid="credits-link" @click.prevent="view = 'credits'">致謝</a>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    'top top'
    'err err'
    'side main'
    'foot foot';
  min-height: 100vh;
}
.top {
  grid-area: top;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
h1 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-accent);
}
.views {
  display: flex;
  gap: var(--space-1);
}
.views button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}
.views button.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.bar {
  margin-left: auto;
}
.side {
  grid-area: side;
  padding: var(--space-3);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}
.main {
  grid-area: main;
  padding: var(--space-3) var(--space-4);
  min-width: 0;
}
.main.full {
  grid-column: 1 / -1;
}
.foot {
  grid-area: foot;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  text-align: center;
}
.foot a {
  color: var(--color-accent);
}
.error {
  grid-area: err;
  margin: var(--space-2) var(--space-4);
  color: var(--color-danger);
}
</style>
